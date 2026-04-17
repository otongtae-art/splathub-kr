'use client';

/**
 * 클라이언트 사이드 3D Gaussian Splat 생성기.
 *
 * antimatter15 표준 `.splat` 바이너리 포맷으로 출력:
 *   - 32 bytes per splat
 *   - position (3 × float32 LE) = 12
 *   - scale    (3 × float32 LE, **linear** 실제 크기) = 12
 *   - color    (4 × uint8, RGBA 0-255) = 4
 *   - rotation (4 × uint8, quaternion 각 요소 = (v-128)/128) = 4
 *
 * .ply 포맷을 피한 이유: PLY는 3DGS 관용 표기(scale=log space, opacity=logit,
 * color=SH DC half-Lambertian)가 다르고 뷰어마다 파서 구현이 제각각이라
 * 어느 값이 맞는지 확인이 불가능. .splat은 모든 값이 직관적이고 Spark.js가
 * 명시적으로 지원한다.
 *
 * 파이프라인:
 *   1. 입력 사진들을 부채꼴로 3D 공간에 배치
 *   2. 각 사진의 픽셀 → 3D splat (position + linear scale + RGB + identity quat)
 *   3. 32-byte-per-splat binary 로 인코딩 → Uint8Array
 */

const BYTES_PER_SPLAT = 32;

type GenerationOptions = {
  stride: number;
  radius: number;
  /** 각 splat의 실제 반경 (linear, 월드 유닛). 0.08 = 약 8cm */
  splatSize: number;
  depthRange: number;
  maxWidth: number;
  onProgress?: (fraction: number) => void;
};

const DEFAULTS: GenerationOptions = {
  stride: 6,
  radius: 1.6,
  splatSize: 0.04,
  depthRange: 0.35,
  maxWidth: 512,
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
 * 파일 배열로부터 `.splat` 바이트를 생성.
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

  const angleStep = n > 1 ? (2 * Math.PI) / n : 0;
  const fov = Math.min(n > 1 ? angleStep * 1.1 : Math.PI / 2.5, Math.PI / 2);

  for (let i = 0; i < n; i++) {
    const img = images[i]!;
    const angle = i * angleStep - Math.PI / 2;
    const pts = samplePhoto(img, angle, fov, opts);
    points.push(...pts);
    opts.onProgress?.((i + 1) / n * 0.75);
    await new Promise((r) => setTimeout(r, 0));
  }

  opts.onProgress?.(0.85);

  const bytes = encodeSplat(points, opts);
  opts.onProgress?.(1);

  console.info(
    `[gen3d] generated ${points.length} splats, ${bytes.byteLength} bytes (.splat format)`,
  );
  return bytes;
}

function samplePhoto(
  img: HTMLImageElement,
  angle: number,
  fov: number,
  opts: GenerationOptions,
): PixelPoint[] {
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
  // right vector (카메라 기준 오른쪽)
  const rx = -Math.sin(angle);
  const rz = Math.cos(angle);

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

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const depthOffset = (luma - 0.5) * opts.depthRange;
      const radius = opts.radius + depthOffset;

      // 픽셀 → 카메라 평면 (-1..1)
      const u = (px / w) * 2 - 1;
      const v = (py / h) * 2 - 1;
      const thU = u * halfFov;
      const thV = (v * halfFov) / aspect;

      const offsetRight = Math.tan(thU) * radius;
      const offsetUp = Math.tan(thV) * radius;

      // 3D 월드 위치
      const wx = cx * radius + rx * offsetRight;
      // three.js / splat 관용: Y up, 이미지 v가 아래로 갈수록 커지므로 -offsetUp
      const wy = -offsetUp;
      const wz = cz * radius + rz * offsetRight;

      points.push({ x: wx, y: wy, z: wz, r, g, b });
    }
  }

  return points;
}

/**
 * .splat binary 인코딩.
 */
function encodeSplat(points: PixelPoint[], opts: GenerationOptions): Uint8Array {
  const count = points.length;
  const buffer = new ArrayBuffer(count * BYTES_PER_SPLAT);
  const view = new DataView(buffer);

  const size = opts.splatSize;

  for (let i = 0; i < count; i++) {
    const p = points[i]!;
    let offset = i * BYTES_PER_SPLAT;

    // position
    view.setFloat32(offset, p.x, true); offset += 4;
    view.setFloat32(offset, p.y, true); offset += 4;
    view.setFloat32(offset, p.z, true); offset += 4;
    // scale (linear, 실제 크기)
    view.setFloat32(offset, size, true); offset += 4;
    view.setFloat32(offset, size, true); offset += 4;
    view.setFloat32(offset, size, true); offset += 4;
    // color RGBA (uint8, 0-255)
    view.setUint8(offset, Math.round(p.r * 255)); offset += 1;
    view.setUint8(offset, Math.round(p.g * 255)); offset += 1;
    view.setUint8(offset, Math.round(p.b * 255)); offset += 1;
    view.setUint8(offset, 255); offset += 1; // alpha = fully opaque
    // rotation — identity quaternion.
    // .splat 규칙: 각 요소 = (byte - 128) / 128
    // identity (w=1, x=y=z=0) → w=255, x=y=z=128
    view.setUint8(offset, 255); offset += 1; // w
    view.setUint8(offset, 128); offset += 1; // x
    view.setUint8(offset, 128); offset += 1; // y
    view.setUint8(offset, 128); offset += 1; // z

    if (offset - i * BYTES_PER_SPLAT !== BYTES_PER_SPLAT) {
      throw new Error(
        `encodeSplat bug: wrote ${offset - i * BYTES_PER_SPLAT} bytes vs expected ${BYTES_PER_SPLAT}`,
      );
    }
  }

  return new Uint8Array(buffer);
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
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
