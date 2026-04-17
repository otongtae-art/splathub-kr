'use client';

/**
 * GaussianSplatViewer — Spark.js + Three.js 기반 .spz / .ply / .sog / .splat 뷰어.
 *
 * 모든 모델 페이지(/m/[slug], /embed/[id])와 변환 결과 미리보기(/convert, /capture)가
 * 이 컴포넌트 하나에 의존한다. 따라서 API 안정성이 중요 — props를 조심스럽게 설계하고
 * 에러는 onError로 위임해 상위가 재시도 UI를 그리게 한다.
 *
 * 참고: Spark.js (sparkjsdev/spark) 는 Three.js scene graph 위에서 동작하는 splat mesh
 * 를 제공한다. 실제 import 경로와 생성자 시그니처는 공식 버전에 따라 조정 필요.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraPose, ViewerQuality } from '@/lib/shared/types';
import {
  detectDeviceProfile,
  devicePixelRatioCap,
  maxGaussiansForProfile,
} from '@/lib/device';

type Props = {
  /** .spz / .ply / .sog / .splat 중 어떤 것이든 원격 URL */
  url: string;
  /** 자동 회전 (랜딩·미리보기용) */
  autoRotate?: boolean;
  /** 첫 렌더 시 카메라 위치. 없으면 (0, 0, 3) */
  initialCamera?: CameraPose;
  /** 명시적 품질 선택. 기본 'auto'는 디바이스 프로파일에 위임 */
  quality?: ViewerQuality;
  /** 배경색 (Three.js scene.background) */
  background?: string | null;
  /** 로드 성공 */
  onLoad?: () => void;
  /** 로드 실패 — 상위가 fallback UI를 그리는 데 사용 */
  onError?: (err: Error) => void;
  /** 추가 className */
  className?: string;
};

export default function GaussianSplatViewer({
  url,
  autoRotate = false,
  initialCamera,
  quality = 'auto',
  background = null,
  onLoad,
  onError,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'init' | 'loading' | 'ready' | 'error'>('init');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let mesh: THREE.Object3D | null = null;
    let onResize: (() => void) | null = null;
    const scene = new THREE.Scene();
    if (background) scene.background = new THREE.Color(background);

    const profile = quality === 'auto' ? detectDeviceProfile() : quality === 'high' ? 'high' : 'low';
    const maxGaussians = maxGaussiansForProfile(profile);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.05, 200);
    if (initialCamera) {
      camera.position.set(...initialCamera.position);
    } else {
      camera.position.set(0, 0, 3);
    }

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: background === null,
        powerPreference: profile === 'high' ? 'high-performance' : 'low-power',
      });
      renderer.setPixelRatio(devicePixelRatioCap(profile));
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.8;
      if (initialCamera) controls.target.set(...initialCamera.target);
      controls.update();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setStatus('error');
      setErrorMessage('WebGL을 지원하지 않는 브라우저입니다.');
      onError?.(e);
      return;
    }

    setStatus('loading');

    // Spark.js는 dynamic import — SSR/Edge 번들에서 제외.
    // @sparkjsdev/spark@2.0 의 SplatMesh 는 Three.js Object3D 를 상속하며 내부적으로
    // URL을 fetch → GPU 업로드를 수행한다. 공식 README 기준 `new SplatMesh({ url })` 가
    // 최소 생성자. 로드 완료 이벤트가 표준화되지 않아 `scene.add` 후 한 프레임이 그려지면
    // 렌더가 되기 시작하는 식 — UX 상 "로딩 중" 오버레이는 첫 프레임 직전 사라지도록
    // requestAnimationFrame 한 번만 기다린다. 실제 로드 실패는 상위 fetch가 던지는
    // 예외로 잡히므로 try/catch 유지.
    (async () => {
      try {
        const { SplatMesh } = await import('@sparkjsdev/spark');
        if (disposed) return;

        mesh = new SplatMesh({ url });

        // 저사양 보호: Spark는 기본적으로 파일에 포함된 전체 가우시안을 로드하지만,
        // Object3D.userData 에 maxGaussians 힌트를 넣어 상위 레이어가 읽을 수 있게 한다.
        // 향후 Spark가 LOD API를 공개하면 직접 전달로 교체.
        (mesh as unknown as { userData: Record<string, unknown> }).userData.maxGaussians =
          maxGaussians;

        if (disposed) return;
        scene.add(mesh as unknown as THREE.Object3D);

        // 첫 프레임 그려질 때 "ready"로 전환. 이는 실제 완전한 GPU 업로드 완료를
        // 보장하진 않지만, 사용자에게 뷰어가 살아있다는 신호를 즉시 주기 위함.
        requestAnimationFrame(() => {
          if (disposed) return;
          setStatus('ready');
          onLoad?.();
        });
      } catch (err) {
        if (disposed) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setStatus('error');
        setErrorMessage(e.message || '모델을 불러오지 못했습니다.');
        onError?.(e);
      }
    })();

    onResize = () => {
      if (!renderer) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    renderer.setAnimationLoop(() => {
      controls?.update();
      renderer?.render(scene, camera);
    });

    return () => {
      disposed = true;
      if (onResize) window.removeEventListener('resize', onResize);
      renderer?.setAnimationLoop(null);
      if (mesh) {
        scene.remove(mesh as unknown as THREE.Object3D);
        const disposable = mesh as unknown as { dispose?: () => void };
        disposable.dispose?.();
      }
      controls?.dispose();
      if (renderer) {
        renderer.dispose();
        try {
          container.removeChild(renderer.domElement);
        } catch {
          /* already removed */
        }
      }
    };
  }, [url, autoRotate, initialCamera, quality, background, onLoad, onError]);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className ?? ''}`}
      data-status={status}
    >
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-300">
          모델 로딩 중…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-900/80 px-6 text-center">
          <p className="text-sm font-semibold text-ink-100">모델을 불러오지 못했습니다</p>
          <p className="text-xs text-ink-400">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
