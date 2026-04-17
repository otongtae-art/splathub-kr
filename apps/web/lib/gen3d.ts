'use client';

/**
 * 클라이언트 사이드 3D Gaussian Splat 생성기.
 *
 * 완전한 AI 기반 multi-view reconstruction (VGGT + FreeSplatter) 은 GPU 서버가
 * 필요하지만, 비용 $0 제약 하에서도 "실제 사용자 사진이 3D로 변환되어 보이는"
 * 결과를 제공하기 위해 브라우저에서 직접 Gaussian Splat을 생성한다.
 *
 * 파이프라인:
 *   1. 입력 사진들을 부채꼴로 3D 공간에 배치 (각 사진 → 카메라 frustum)
 *   2. 각 사진의 픽셀 → 3D 포인트 (luminance 기반 간이 depth + radial 분포)
 *   3. 각 픽셀을 3D Gaussian으로 변환 (위치 + 색 + scale + opacity + quat)
 *   4. 표준 3DGS .ply binary 포맷으로 인코딩 → Blob URL
 *
 * 품질은 진짜 VGGT+FreeSplatter 대비 낮지만:
 *   - 사용자 사진이 실제로 3D 공간에 반영됨
 *   - 완전 무료, 서버 불필요
 *   - 뷰어에서 카메라를 돌리면 정말 3D 느낌을 준다
 *   - 사용자가 HF Space 직접 배포(docs/PRODUCTION.md) 하면 이 함수를 교체하면 됨
 */

// 3DGS .ply 포맷 — SH degree 0 (DC only) 버전, 17 properties per vertex.
// position(3) + normal(3) + SH DC(3) + opacity(1) + scale(3) + rot(4) = 17
// SH rest(45)를 생략해 파일 크기·메모리·렌더 성능을 모두 개선. Spark.js는
// SH degree 0 형식을 네이티브로 파싱한다.
const PROPS_PER_GAUSSIAN = 17;
const BYTES_PER_FLOAT = 4;
const BYTES_PER_GAUSSIAN = PROPS_PER_GAUSSIAN * BYTES_PER_FLOAT;

// 3DGS half-Lambertian SH DC 상수
const SH_C0 = 0.28209479177387814;

type GenerationOptions = {
  /** 샘플링 간격 (픽셀). 낮을수록 더 촘촘 / 더 무거움 */
  stride: number;
  /** 결과물의 전체 반지름 (월드 유닛) */
  radius: number;
  /** 각 Gaussian의 기본 scale (log space) */
  baseScale: number;
  /** Depth 변화의 진폭 */
  depthRange: number;
  /** 입력 사진 리사이즈 상한 (가로) */
  maxWidth: number;
  /** 진행률 콜백 */
  onProgress?: (fraction: number) => void;
};

const DEFAULTS: GenerationOptions = {
  stride: 4,
  radius: 1.6,
  baseScale: -4.2,
  depthRange: 0.35,
  maxWidth: 480,
};

type PixelPoint = {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
};

/**
 * 파일 배열로부터 .ply Uint8Array 를 생성한다.
 * Blob URL 방식은 Spark.js에서 파일 포맷 자동 감지 실패 가능성이 있어
 * 바이트 배열을 직접 반환해 `SplatMesh({ fileBytes, fileType: 'ply' })` 로 넘긴다.
 */
export async function generateSplatFromPhotos(
  files: File[],
  options: Partial<GenerationOptions> = {},
): Promise<Uint8Array> {
  const opts: GenerationOptions = { ...DEFAULTS, ...options };
  if (files.length === 0) throw new Error('no input photos');

  const images = await Promise.all(files.map(loadImage));
  const n = images.length;
  const points: PixelPoint[] = [];

  // 각 사진을 부채꼴로 배치 — N장이면 angle = i/N * 2π
  // 한 장이면 정면, 두 장이면 좌/우 반씩, 등
  const angleStep = n > 1 ? (2 * Math.PI) / n : 0;
  const fov = Math.min(angleStep * 1.1, Math.PI / 3); // 이웃 사진과 살짝 겹치게

  for (let i = 0; i < n; i++) {
    const img = images[i]!;
    const angle = i * angleStep - Math.PI / 2; // 첫 사진이 +Z 방향
    const pts = samplePhoto(img, angle, fov, opts);
    points.push(...pts);
    opts.onProgress?.((i + 1) / n * 0.6);
    // 메인 스레드 양보
    await new Promise((r) => setTimeout(r, 0));
  }

  opts.onProgress?.(0.75);

  // Gaussian 버퍼 빌드 → .ply binary 인코딩
  const plyBytes = encodePly(points, opts);
  opts.onProgress?.(1);
  // 디버깅에 쓸 수 있도록 메타 정보를 콘솔에 명시적으로 남긴다
  console.info(
    `[gen3d] generated ${points.length} gaussians, ${plyBytes.byteLength} bytes (.ply SH degree 0)`,
  );
  return plyBytes;
}

/**
 * 하나의 이미지를 부채꼴 내의 포인트들로 변환.
 *
 * 좌표계:
 *   - 중심(origin) 기준 카메라는 (angle 방향) 으로 바깥 바라봄
 *   - 픽셀 (u, v) 을 카메라 평면에 투영
 *   - depth 는 luminance 기반 간단 추정 + 원점 쪽으로 흡수
 */
function samplePhoto(
  img: HTMLImageElement,
  angle: number,
  fov: number,
  opts: GenerationOptions,
): PixelPoint[] {
  // 리사이즈된 크기로 Canvas 그리기
  const w = Math.min(img.naturalWidth, opts.maxWidth);
  const h = Math.round((img.naturalHeight * w) / img.naturalWidth);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d context failed');
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  // 카메라 방향 — 원점에서 바깥(angle 방향)을 바라봄
  const cx = Math.cos(angle);
  const cz = Math.sin(angle);
  // 카메라 right / up 벡터
  const rx = -Math.sin(angle);
  const rz = Math.cos(angle);
  const ux = 0;
  const uy = 1;
  const uz = 0;

  const halfFov = fov / 2;
  const aspect = w / h;

  const points: PixelPoint[] = [];
  const stride = opts.stride;

  for (let py = 0; py < h; py += stride) {
    for (let px = 0; px < w; px += stride) {
      const idx = (py * w + px) * 4;
      const r = data[idx]! / 255;
      const g = data[idx + 1]! / 255;
      const b = data[idx + 2]! / 255;
      const a = data[idx + 3]! / 255;
      if (a < 0.2) continue;

      // 간단한 depth: luminance가 높을수록 카메라에 가까움 (대략적)
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const depthOffset = (luma - 0.5) * opts.depthRange;

      // 픽셀 → 카메라 평면 (-1..1 범위)
      const u = (px / w) * 2 - 1; // -1 왼쪽, +1 오른쪽
      const v = (py / h) * 2 - 1; // -1 위, +1 아래
      // 수직 FoV는 aspect로 보정
      const thU = u * halfFov;
      const thV = (v * halfFov) / aspect;

      // 카메라 광축에서 얼마나 벗어났는지를 카메라 basis로 변환
      const offsetRight = Math.tan(thU);
      const offsetUp = -Math.tan(thV);

      // 3D 위치: 원점에서 angle 방향으로 radius 만큼 전진 후 right/up offset
      const radius = opts.radius + depthOffset;
      const wx = cx * radius + rx * offsetRight * radius + ux * offsetUp * radius;
      const wy = 0 + uy * offsetUp * radius;
      const wz = cz * radius + rz * offsetRight * radius + uz * offsetUp * radius;

      points.push({ x: wx, y: -wy, z: wz, r, g, b });
    }
  }

  return points;
}

/**
 * 3DGS 표준 .ply binary 인코딩 → 단일 Uint8Array.
 */
function encodePly(points: PixelPoint[], opts: GenerationOptions): Uint8Array {
  const count = points.length;

  // 헤더 — SH degree 0 (SH rest 0개)
  const propertyLines = [
    'property float x',
    'property float y',
    'property float z',
    'property float nx',
    'property float ny',
    'property float nz',
    'property float f_dc_0',
    'property float f_dc_1',
    'property float f_dc_2',
    'property float opacity',
    'property float scale_0',
    'property float scale_1',
    'property float scale_2',
    'property float rot_0',
    'property float rot_1',
    'property float rot_2',
    'property float rot_3',
  ];

  const header =
    'ply\n' +
    'format binary_little_endian 1.0\n' +
    `element vertex ${count}\n` +
    propertyLines.join('\n') +
    '\nend_header\n';

  const headerBytes = new TextEncoder().encode(header);
  const bodyLength = count * BYTES_PER_GAUSSIAN;
  const bodyBytes = new ArrayBuffer(bodyLength);
  const view = new DataView(bodyBytes);

  // 로짓(0.85) ≈ 1.7346 — 불투명도를 거의 꽉 채움
  const opacityLogit = 1.7346;

  for (let i = 0; i < count; i++) {
    const p = points[i]!;
    let offset = i * BYTES_PER_GAUSSIAN;

    // position
    view.setFloat32(offset, p.x, true); offset += 4;
    view.setFloat32(offset, p.y, true); offset += 4;
    view.setFloat32(offset, p.z, true); offset += 4;
    // normal (3DGS는 사용 안 함)
    view.setFloat32(offset, 0, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;
    // SH DC — half-Lambertian 색 인코딩
    view.setFloat32(offset, (p.r - 0.5) / SH_C0, true); offset += 4;
    view.setFloat32(offset, (p.g - 0.5) / SH_C0, true); offset += 4;
    view.setFloat32(offset, (p.b - 0.5) / SH_C0, true); offset += 4;
    // (SH rest 생략 — SH degree 0)
    // opacity (logit)
    view.setFloat32(offset, opacityLogit, true); offset += 4;
    // scale (log space)
    view.setFloat32(offset, opts.baseScale, true); offset += 4;
    view.setFloat32(offset, opts.baseScale, true); offset += 4;
    view.setFloat32(offset, opts.baseScale, true); offset += 4;
    // rotation (identity quaternion w x y z)
    view.setFloat32(offset, 1, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;

    // Sanity check — 실제 쓴 바이트 수가 선언한 BYTES_PER_GAUSSIAN과 일치해야 함
    if (offset - i * BYTES_PER_GAUSSIAN !== BYTES_PER_GAUSSIAN) {
      throw new Error(
        `encodePly bug: wrote ${offset - i * BYTES_PER_GAUSSIAN} bytes but declared ${BYTES_PER_GAUSSIAN}`,
      );
    }
  }

  // header + body 를 하나의 Uint8Array로 연결
  const out = new Uint8Array(headerBytes.byteLength + bodyLength);
  out.set(headerBytes, 0);
  out.set(new Uint8Array(bodyBytes), headerBytes.byteLength);
  return out;
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // revoke 후에도 이미지는 메모리에 남음 (이미 디코드됨)
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
