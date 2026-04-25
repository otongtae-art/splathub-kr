'use client';

/**
 * MeshViewer — GLTF/GLB 3D mesh 뷰어.
 *
 * TripoSR 같은 single-image-3D 모델이 생성한 .glb 결과물을 표시한다.
 * Spark.js의 SplatMesh는 Gaussian Splat 전용이라 mesh 는 Three.js GLTFLoader
 * 로 별도 로드. 이렇게 하면 "진짜 3D 구조"가 사용자에게 보인다.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ViewerStats = {
  /** 원본 점 개수 (outlier 제거 전) */
  pointsCount: number;
  /** outlier 제거 후 남은 점 개수 */
  retainedCount: number;
  /** trimmed bbox 의 최대 차원 (m) */
  bboxDim: number;
  /** trimmed bbox 의 최소 차원 (m) — 깊이 두께 */
  depthSpread: number;
  /** depthSpread / bboxDim ∈ [0, 1]. < 0.15 면 평면 layer = monster 의심 */
  flatness: number;
};

type Props = {
  url?: string;
  fileBytes?: Uint8Array;
  autoRotate?: boolean;
  onLoad?: () => void;
  onError?: (err: Error) => void;
  /** VGGT pointcloud 의 통계 콜백. mesh 로드는 호출 안 됨. */
  onStats?: (stats: ViewerStats) => void;
};

export default function MeshViewer({
  url,
  fileBytes,
  autoRotate = false,
  onLoad,
  onError,
  onStats,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState<string | null>(null);
  // 부모가 매 렌더마다 새 함수 참조를 넘겨도 useEffect 재실행 안 되도록 ref 패턴
  const onStatsRef = useRef(onStats);
  useEffect(() => {
    onStatsRef.current = onStats;
  }, [onStats]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!url && !fileBytes) return;

    let disposed = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0e1011');

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    camera.position.set(0, 0, 2.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    // 기본 라이팅 — PBR 재질이 잘 보이도록 ambient + 2 direction
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(1, 2, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-2, 1, -1);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.0;

    const loader = new GLTFLoader();
    const onResult = (gltf: { scene: THREE.Object3D }) => {
      if (disposed) return;
      const model = gltf.scene;

      // VGGT pointcloud GLB 감지 → 점 크기 확대 + outlier 제거 + auto-fit
      // VGGT 는 멀리 튀는 noise 점들을 종종 출력함. 그대로 bbox 잡으면 카메라가
      // 너무 멀어져 객체가 viewport 밖으로 빠져 "빈 화면"처럼 보임 = monster 체감.
      // 5–95 percentile 거리 trim 으로 진짜 객체 bbox 를 얻고 그 기준으로 fit.
      let totalPoints = 0;
      let retainedPoints = 0;
      let pointsBox: THREE.Box3 | null = null;
      model.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Points).isPoints) {
          const points = child as THREE.Points;
          const original = points.geometry.attributes.position?.count ?? 0;
          totalPoints += original;

          // 1) PointsMaterial 교체 — 점 size 키움, 거리별 축소 활성
          const oldMat = points.material as THREE.PointsMaterial;
          const newMat = new THREE.PointsMaterial({
            size: 0.008, // 객체 크기 ~1m 기준 8mm 점 (surface 처럼)
            vertexColors: !!(oldMat.vertexColors ?? true),
            sizeAttenuation: true,
          });
          if (oldMat.map) newMat.map = oldMat.map;
          if (!newMat.vertexColors && oldMat.color) {
            newMat.color.copy(oldMat.color);
          }
          points.material = newMat;
          oldMat.dispose();

          // 2) outlier trim — centroid 기준 [5%, 95%] 거리 percentile 만 유지
          if (original >= 100) {
            const trimmed = trimPointcloudOutliers(points);
            retainedPoints += trimmed.retained;
            if (!pointsBox) pointsBox = trimmed.bbox.clone();
            else pointsBox.union(trimmed.bbox);
          } else {
            retainedPoints += original;
          }
        }
      });

      // 자동 fit: pointcloud 면 trimmed bbox, mesh 면 모델 전체 bbox
      const box = pointsBox ?? new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fovRad = (camera.fov * Math.PI) / 180;
      // 1.4 → 1.6: outlier trim 후엔 진짜 객체 크기라 약간 여유 줘도 좋음
      const distance = (maxDim * 1.6) / (2 * Math.tan(fovRad / 2));
      camera.position.copy(center);
      camera.position.z += distance;
      controls.target.copy(center);
      controls.update();

      // VGGT pointcloud 면 통계 콜백
      if (totalPoints > 0) {
        const dimsSorted = [size.x, size.y, size.z].sort((a, b) => b - a);
        const bboxDim = dimsSorted[0];
        const depthSpread = dimsSorted[2];
        const flatness = bboxDim > 0 ? depthSpread / bboxDim : 0;
        console.info(
          `[MeshViewer] VGGT pointcloud: ${totalPoints} → ${retainedPoints} (95% kept), bbox=${bboxDim.toFixed(2)}m, depth=${depthSpread.toFixed(2)}m, flatness=${flatness.toFixed(2)}`,
        );
        onStatsRef.current?.({
          pointsCount: totalPoints,
          retainedCount: retainedPoints,
          bboxDim,
          depthSpread,
          flatness,
        });
      }

      scene.add(model);
      setStatus('ready');
      onLoad?.();
    };

    const onLoadError = (e: ErrorEvent | Error) => {
      if (disposed) return;
      const msg = e instanceof Error ? e.message : 'unknown error';
      console.error('[MeshViewer] GLB load failed', e);
      setStatus('error');
      setErr(msg);
      onError?.(e instanceof Error ? e : new Error(msg));
    };

    if (fileBytes) {
      loader.parse(
        (fileBytes.buffer as ArrayBuffer).slice(
          fileBytes.byteOffset,
          fileBytes.byteOffset + fileBytes.byteLength,
        ),
        '',
        onResult,
        onLoadError as unknown as (e: unknown) => void,
      );
    } else if (url) {
      loader.load(url, onResult, undefined, onLoadError as unknown as (e: unknown) => void);
    }

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    const onResize = () => {
      const nw = container.clientWidth || 800;
      const nh = container.clientHeight || 600;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      renderer.setAnimationLoop(null);
      controls.dispose();
      renderer.dispose();
      try {
        container.removeChild(renderer.domElement);
      } catch {
        /* noop */
      }
    };
  }, [url, fileBytes, autoRotate, onLoad, onError]);

  return (
    <div ref={containerRef} className="relative h-full w-full bg-base-0">
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-base-400">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          3D mesh 로드 중
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
          <p className="text-sm font-medium text-base-100">mesh 로드 실패</p>
          <p className="text-xs text-base-400">{err}</p>
        </div>
      )}
    </div>
  );
}
