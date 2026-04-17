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

type Props = {
  url?: string;
  fileBytes?: Uint8Array;
  autoRotate?: boolean;
  onLoad?: () => void;
  onError?: (err: Error) => void;
};

export default function MeshViewer({
  url,
  fileBytes,
  autoRotate = false,
  onLoad,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState<string | null>(null);

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

      // 자동 fit: bounding box 기준 카메라 거리 조정
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fovRad = (camera.fov * Math.PI) / 180;
      const distance = (maxDim * 1.4) / (2 * Math.tan(fovRad / 2));
      camera.position.copy(center);
      camera.position.z += distance;
      controls.target.copy(center);
      controls.update();

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
