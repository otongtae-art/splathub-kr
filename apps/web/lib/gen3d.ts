'use client';

/**
 * 실제 Depth-aware 3D Gaussian Splat 생성기.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 이 파일은 사용자가 촬영한 사진을 *실제* 3D 구조로 재구성한다. 단순히 사진을
 * 평면으로 세워놓는 게 아니라, AI depth estimation 모델(Depth Anything V2)이
 * 각 이미지에서 객체의 실제 depth map을 뽑아내고 그것을 3D 공간에 unproject
 * 하여 point cloud를 만든 뒤 Gaussian splat으로 인코딩한다.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 파이프라인:
 *   1. 각 사진 → Depth Anything V2 Small (ONNX, WebGPU) → depth map
 *   2. 각 픽셀 (u, v, depth) → camera-frame 3D 점 (X, Y, Z)
 *      (가정: principal point = 중앙, focal length = W / (2 tan(fov/2)), fov=60°)
 *   3. 촬영 순서 = 대상 주변을 도는 순서로 간주해 각 이미지의 world pose 할당
 *      → image i의 rotation_y = 2π · i / N, translation = radius 만큼 바깥
 *   4. 각 이미지의 카메라-프레임 점들을 world 좌표로 변환 후 병합
 *   5. Voxel grid downsample (중복 제거) — 비슷한 위치의 점들은 색상 평균
 *   6. .splat 포맷 32-byte binary 로 인코딩 → Spark.js SplatMesh 에 직접 전달
 *
 * 레퍼런스:
 *   - Depth Anything V2: https://github.com/DepthAnything/Depth-Anything-V2
 *   - transformers.js: https://huggingface.co/docs/transformers.js
 *   - .splat 포맷: antimatter15/splat (32 bytes/splat)
 */

import { estimateDepth, type DepthProgress } from './depth';
import { measureQuality, applyHistogramEqualization } from './preprocess';
import { scoreDepthMap, decideMode, type ModeDetectionScore } from './modeDetect';

const BYTES_PER_SPLAT = 32;

/**
 * 재구성 모드:
 *   - 'auto':   depth 분포 분석으로 자동 판별 (권장, 기본값)
 *   - 'object': 카메라가 대상 주위를 원형으로 이동 (안을 바라봄)
 *               예: 가구, 인형, 제품 스캔
 *   - 'scene':  카메라가 한 지점에서 회전만 함 (밖을 바라봄)
 *               예: 아파트 실내, 방, 가상 투어
 */
export type ReconstructionMode = 'auto' | 'object' | 'scene';

type GenerationOptions = {
  mode: ReconstructionMode;
  /** 각 이미지에서 샘플링할 픽셀 stride. 낮을수록 점 많음. */
  stride: number;
  /**
   * object 모드: 객체 중심까지의 카메라 거리 (촬영 원 반경).
   * scene 모드: 무시 (origin 고정).
   */
  cameraRadius: number;
  /** 각 splat 의 반경 (linear, 월드 유닛). 0.02 = 2cm */
  splatSize: number;
  /** Depth 를 world 단위로 스케일. */
  depthScale: number;
  /** 카메라 FoV (수평, degree) */
  fovDeg: number;
  /** Voxel downsample 격자 크기 */
  voxelSize: number;
  /** 입력 이미지 최대 해상도 (depth 모델 입력) */
  maxWidth: number;
  /** 최소 depth 신뢰도 (0 ~ 1, 배경 컷오프) */
  minConfidence: number;
  onProgress?: (fraction: number, label?: string) => void;
  onModelProgress?: (p: DepthProgress) => void;
};

const DEFAULTS: Omit<GenerationOptions, 'mode'> = {
  stride: 4,
  cameraRadius: 2.0,
  splatSize: 0.02,
  depthScale: 1.5,
  fovDeg: 60,
  voxelSize: 0.015,
  maxWidth: 512,
  minConfidence: 0.05,
};

/** scene 모드 기본값 — depth 스케일을 더 크게 해서 공간이 넓게 펼쳐짐 */
const SCENE_OVERRIDES: Partial<GenerationOptions> = {
  depthScale: 4.0,
  splatSize: 0.04,
  voxelSize: 0.03,
  fovDeg: 75, // 실내는 넓은 FoV 가 자연스러움
  minConfidence: 0.02,
};

type WorldPoint = {
  x: number;
  y: number;
  z: number;
  r: number; // 0..1
  g: number;
  b: number;
};

export async function generateSplatFromPhotos(
  files: File[],
  options: Partial<GenerationOptions> & { mode?: ReconstructionMode } = {},
): Promise<Uint8Array> {
  const requestedMode: ReconstructionMode = options.mode ?? 'auto';
  if (files.length === 0) throw new Error('사진이 없습니다.');

  // 1) 품질 보정 — 블러 필터링 + 노출 정규화 (preprocess 모듈)
  console.info(`[gen3d] input: ${files.length} files, mode=${requestedMode}`);
  const opts0: GenerationOptions = {
    ...DEFAULTS,
    ...options,
    mode: requestedMode,
  };
  opts0.onProgress?.(0.02, 'AI 모델 준비');

  const rawImages = await Promise.all(files.map(loadImage));
  opts0.onProgress?.(0.04, '품질 검사');

  const usableCanvases: HTMLCanvasElement[] = [];
  let droppedBlurry = 0;
  let fixedExposure = 0;
  for (const img of rawImages) {
    const c = toCanvas(img, opts0.maxWidth);
    const q = measureQuality(c);
    if (q.isBlurry && rawImages.length > 3) {
      droppedBlurry++;
      continue; // 사진이 최소 4장 이상일 때만 블러 제거 (안전장치)
    }
    if (q.isBadlyExposed) {
      applyHistogramEqualization(c);
      fixedExposure++;
    }
    usableCanvases.push(c);
  }
  if (usableCanvases.length === 0) {
    // 모두 흐리면 원본 재사용
    for (const img of rawImages) usableCanvases.push(toCanvas(img, opts0.maxWidth));
  }
  if (droppedBlurry > 0) {
    console.info(`[gen3d] quality filter: dropped ${droppedBlurry} blurry, fixed exposure on ${fixedExposure}`);
  }

  // 2) 각 이미지 depth 추정
  const n = usableCanvases.length;
  const depths: Array<Awaited<ReturnType<typeof estimateDepth>>> = [];
  for (let i = 0; i < n; i++) {
    opts0.onProgress?.(0.05 + (i / n) * 0.4, `${i + 1}/${n} 깊이 추정`);
    try {
      const d = await estimateDepth(usableCanvases[i]!, opts0.onModelProgress);
      depths.push(d);
    } catch (err) {
      console.error('[gen3d] depth estimation failed', err);
      throw new Error(
        `AI 모델을 로드하지 못했습니다. 브라우저가 WebGPU/WASM을 지원하는지 확인해주세요. (${(err as Error).message})`,
      );
    }
    await new Promise((r) => setTimeout(r, 0));
  }

  // 3) 자동 모드 판별 (requestedMode === 'auto' 일 때)
  let resolvedMode: 'object' | 'scene';
  if (requestedMode === 'auto') {
    const scoresArr: ModeDetectionScore[] = depths.map((d) => scoreDepthMap(d));
    const decision = decideMode(scoresArr);
    resolvedMode = decision.mode;
    console.info(
      `[gen3d] auto-detected mode=${resolvedMode} (confidence=${decision.confidence.toFixed(2)}, avgObjectScore=${(scoresArr.reduce((a, s) => a + s.objectScore, 0) / scoresArr.length).toFixed(2)})`,
    );
    opts0.onProgress?.(0.48, `모드 자동 판별: ${resolvedMode === 'object' ? '객체' : '공간'}`);
  } else {
    resolvedMode = requestedMode;
  }

  // 4) 모드별 옵션 병합
  const modeOverrides = resolvedMode === 'scene' ? SCENE_OVERRIDES : {};
  const opts: GenerationOptions = {
    ...DEFAULTS,
    ...modeOverrides,
    ...options,
    mode: resolvedMode,
  };

  // 5) world point 누적
  const allPoints: WorldPoint[] = [];
  const fovRad = (opts.fovDeg * Math.PI) / 180;

  for (let i = 0; i < n; i++) {
    opts.onProgress?.(0.5 + (i / n) * 0.35, `${i + 1}/${n} 3D 공간 투영`);
    const depth = depths[i]!;
    const canvas = usableCanvases[i]!;
    const angle = n > 1 ? (i / n) * 2 * Math.PI - Math.PI / 2 : 0;
    const cameraPose =
      opts.mode === 'object'
        ? buildObjectPose(angle, opts.cameraRadius)
        : buildScenePose(angle);
    unprojectDepthToWorld(depth, canvas, cameraPose, fovRad, opts, allPoints);

    // 메인 스레드 양보
    await new Promise((r) => setTimeout(r, 0));
  }

  opts.onProgress?.(0.9, `${allPoints.length.toLocaleString()}개 점 정리`);

  // Voxel downsample — 같은 voxel에 떨어진 점들 색 평균
  const merged = voxelDownsample(allPoints, opts.voxelSize);

  opts.onProgress?.(0.95, '.splat 인코딩');

  const bytes = encodeSplat(merged, opts);
  opts.onProgress?.(1, '완료');

  console.info(
    `[gen3d] ${allPoints.length.toLocaleString()} raw → ${merged.length.toLocaleString()} downsampled, ${bytes.byteLength.toLocaleString()} bytes .splat`,
  );
  return bytes;
}

// ────────────────────────────────────────────────────────────────────────────

type CameraPose = {
  /** 3x3 rotation matrix, world←camera */
  R: Float32Array;
  /** camera origin in world */
  t: [number, number, number];
};

/**
 * 객체 모드: 카메라가 원 위에 있고 원점을 향함.
 * 사용자가 대상 주위를 돌면서 안쪽을 촬영하는 상황.
 */
function buildObjectPose(angle: number, radius: number): CameraPose {
  // 카메라 위치
  const tx = Math.cos(angle) * radius;
  const ty = 0;
  const tz = Math.sin(angle) * radius;

  // 카메라 forward = 원점 - 위치 (바라보는 방향)
  const fx = -tx;
  const fy = -ty;
  const fz = -tz;
  const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
  const f = [fx / fLen, fy / fLen, fz / fLen];

  // world up
  const up: [number, number, number] = [0, 1, 0];

  // right = forward × up
  const r: [number, number, number] = [
    f[1]! * up[2] - f[2]! * up[1],
    f[2]! * up[0] - f[0]! * up[2],
    f[0]! * up[1] - f[1]! * up[0],
  ];
  const rLen = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) || 1;
  r[0] /= rLen;
  r[1] /= rLen;
  r[2] /= rLen;

  // camera up = right × forward
  const cu: [number, number, number] = [
    r[1] * f[2]! - r[2] * f[1]!,
    r[2] * f[0]! - r[0] * f[2]!,
    r[0] * f[1]! - r[1] * f[0]!,
  ];

  // R columns = [right, up, -forward] (OpenGL convention: camera +X right, +Y up, +Z backward)
  // world_point = R · camera_point + t
  // 우리 unprojection에서 camera_point = (x_cam, y_cam, z_cam) where +Z_cam은 forward
  // 따라서 R · (x_cam·right + y_cam·camUp + z_cam·forward) + t
  const R = new Float32Array([
    r[0], cu[0], f[0]!,
    r[1], cu[1], f[1]!,
    r[2], cu[2], f[2]!,
  ]);

  return { R, t: [tx, ty, tz] };
}

/**
 * 공간(scene) 모드: 카메라가 원점(0,0,0)에 있고 angle 방향으로 회전한 상태.
 * 사용자가 한 자리에 서서 회전만 하며 주변을 촬영하는 상황 (아파트 내부, 방 등).
 * 결과적으로 각 이미지의 depth가 카메라 앞쪽 (각도별) 바깥으로 unproject 되어
 * "둘러싼 공간"으로 재구성된다.
 */
function buildScenePose(angle: number): CameraPose {
  // forward = 각도 방향의 단위 벡터
  const fx = Math.cos(angle);
  const fz = Math.sin(angle);
  const f: [number, number, number] = [fx, 0, fz];

  const up: [number, number, number] = [0, 1, 0];

  // right = forward × up
  const r: [number, number, number] = [
    f[1] * up[2] - f[2] * up[1],
    f[2] * up[0] - f[0] * up[2],
    f[0] * up[1] - f[1] * up[0],
  ];
  const rLen = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) || 1;
  r[0] /= rLen;
  r[1] /= rLen;
  r[2] /= rLen;

  // camera up = right × forward
  const cu: [number, number, number] = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];

  const R = new Float32Array([
    r[0], cu[0], f[0],
    r[1], cu[1], f[1],
    r[2], cu[2], f[2],
  ]);

  // translation = 원점 (사용자가 한 자리에서 회전만 함)
  return { R, t: [0, 0, 0] };
}

function applyPose(
  pose: CameraPose,
  cx: number,
  cy: number,
  cz: number,
): [number, number, number] {
  const { R, t } = pose;
  return [
    R[0]! * cx + R[1]! * cy + R[2]! * cz + t[0],
    R[3]! * cx + R[4]! * cy + R[5]! * cz + t[1],
    R[6]! * cx + R[7]! * cy + R[8]! * cz + t[2],
  ];
}

/**
 * depth map(H × W)의 각 픽셀을 카메라 프레임 3D 좌표로 unproject 후
 * world pose를 적용해 누적.
 *
 * camera intrinsics:
 *   focal = W / (2 tan(fov/2)),  principal point = (W/2, H/2)
 *   camera space: +X right, +Y down, +Z forward (computer vision 관용)
 *   하지만 우리 CameraPose는 Three.js/OpenGL 관용(+Y up) → y 부호 반전
 */
function unprojectDepthToWorld(
  depth: {
    depth: Float32Array;
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
  },
  rgbCanvas: HTMLCanvasElement,
  pose: CameraPose,
  fovRad: number,
  opts: GenerationOptions,
  out: WorldPoint[],
): void {
  const { depth: dMap, width: dW, height: dH } = depth;
  const rgbW = rgbCanvas.width;
  const rgbH = rgbCanvas.height;
  const ctx = rgbCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas ctx failed');
  const rgb = ctx.getImageData(0, 0, rgbW, rgbH).data;

  const focal = rgbW / (2 * Math.tan(fovRad / 2));
  const cxPix = rgbW / 2;
  const cyPix = rgbH / 2;

  const stride = opts.stride;
  const depthScale = opts.depthScale;

  // depth map과 rgb 해상도가 다를 수 있음 → rgb 좌표 기준으로 돌고 depth는 샘플링
  const depthScaleX = dW / rgbW;
  const depthScaleY = dH / rgbH;

  for (let py = 0; py < rgbH; py += stride) {
    for (let px = 0; px < rgbW; px += stride) {
      // depth sample
      const dx = Math.min(Math.floor(px * depthScaleX), dW - 1);
      const dy = Math.min(Math.floor(py * depthScaleY), dH - 1);
      const d = dMap[dy * dW + dx]!;
      if (d < opts.minConfidence) continue; // 배경 컷오프

      // RGB sample
      const idx = (py * rgbW + px) * 4;
      const a = rgb[idx + 3]! / 255;
      if (a < 0.2) continue;
      const r = rgb[idx]! / 255;
      const g = rgb[idx + 1]! / 255;
      const b = rgb[idx + 2]! / 255;

      // Unproject: 카메라 프레임 좌표 (+Z forward, +Y up Three.js 관용)
      // 픽셀 (px, py) → ray direction = ((px - cx) / f, -(py - cy) / f, 1)
      // Y 반전: 이미지 좌표는 아래로 +, Three.js는 위로 +
      const z = d * depthScale;
      const xCam = ((px - cxPix) / focal) * z;
      const yCam = -((py - cyPix) / focal) * z;
      const zCam = z;

      // world 변환
      const [wx, wy, wz] = applyPose(pose, xCam, yCam, zCam);

      out.push({ x: wx, y: wy, z: wz, r, g, b });
    }
  }
}

/**
 * 같은 voxel에 떨어진 점들을 하나로 합침 (색은 평균).
 * 중복 제거로 splat 수를 1/5 ~ 1/10로 줄이되 구조는 유지.
 */
function voxelDownsample(points: WorldPoint[], voxelSize: number): WorldPoint[] {
  const bin = new Map<string, {
    x: number; y: number; z: number;
    r: number; g: number; b: number;
    n: number;
  }>();
  const inv = 1 / voxelSize;
  for (const p of points) {
    const kx = Math.round(p.x * inv);
    const ky = Math.round(p.y * inv);
    const kz = Math.round(p.z * inv);
    const key = `${kx},${ky},${kz}`;
    const existing = bin.get(key);
    if (existing) {
      existing.x += p.x;
      existing.y += p.y;
      existing.z += p.z;
      existing.r += p.r;
      existing.g += p.g;
      existing.b += p.b;
      existing.n += 1;
    } else {
      bin.set(key, { x: p.x, y: p.y, z: p.z, r: p.r, g: p.g, b: p.b, n: 1 });
    }
  }
  const out: WorldPoint[] = [];
  for (const v of bin.values()) {
    out.push({
      x: v.x / v.n,
      y: v.y / v.n,
      z: v.z / v.n,
      r: v.r / v.n,
      g: v.g / v.n,
      b: v.b / v.n,
    });
  }
  return out;
}

function encodeSplat(points: WorldPoint[], opts: GenerationOptions): Uint8Array {
  const count = points.length;
  const buffer = new ArrayBuffer(count * BYTES_PER_SPLAT);
  const view = new DataView(buffer);
  const size = opts.splatSize;

  for (let i = 0; i < count; i++) {
    const p = points[i]!;
    let offset = i * BYTES_PER_SPLAT;

    view.setFloat32(offset, p.x, true); offset += 4;
    view.setFloat32(offset, p.y, true); offset += 4;
    view.setFloat32(offset, p.z, true); offset += 4;
    view.setFloat32(offset, size, true); offset += 4;
    view.setFloat32(offset, size, true); offset += 4;
    view.setFloat32(offset, size, true); offset += 4;
    view.setUint8(offset, Math.round(p.r * 255)); offset += 1;
    view.setUint8(offset, Math.round(p.g * 255)); offset += 1;
    view.setUint8(offset, Math.round(p.b * 255)); offset += 1;
    view.setUint8(offset, 255); offset += 1;
    view.setUint8(offset, 255); offset += 1; // quat.w
    view.setUint8(offset, 128); offset += 1; // quat.x
    view.setUint8(offset, 128); offset += 1; // quat.y
    view.setUint8(offset, 128); offset += 1; // quat.z
  }

  return new Uint8Array(buffer);
}

function toCanvas(img: HTMLImageElement, maxWidth: number): HTMLCanvasElement {
  const w = Math.min(img.naturalWidth, maxWidth);
  const h = Math.round((img.naturalHeight * w) / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas failed');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
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
