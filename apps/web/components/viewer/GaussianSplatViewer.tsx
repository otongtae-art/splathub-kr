'use client';

/**
 * GaussianSplatViewer — Spark.js 2.0 기반 .ply/.spz/.splat/.sog 뷰어.
 *
 * 두 가지 입력 경로:
 *   - `url`: 원격 URL 또는 /public 파일 (샘플 모델용)
 *   - `fileBytes`: 클라이언트에서 생성한 Uint8Array (gen3d 결과). URL을 거치지
 *     않고 Spark의 `fileBytes`에 직접 넘겨 blob: URL의 포맷 감지 실패 이슈를 회피.
 *
 * Spark v2.0 SplatMesh 지원 옵션 (공식 docs 기준):
 *   - url, fileBytes, stream, packedSplats
 *   - fileType (확장자 없을 때 힌트: 'ply' | 'spz' | 'splat' | 'sog')
 *   - onLoad, onProgress — 로드 완료/진행 콜백
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraPose, ViewerQuality } from '@/lib/shared/types';
import { detectDeviceProfile, devicePixelRatioCap } from '@/lib/device';

type Props = {
  /** 원격 .ply/.spz URL (샘플 모델 또는 R2 호스팅 파일) */
  url?: string;
  /** 클라이언트 생성 .ply 바이트 — gen3d 결과를 직접 전달 */
  fileBytes?: Uint8Array;
  /** fileBytes의 확장자 힌트. 기본 'ply' */
  fileType?: 'ply' | 'spz' | 'splat' | 'sog';
  autoRotate?: boolean;
  initialCamera?: CameraPose;
  quality?: ViewerQuality;
  background?: string | null;
  onLoad?: () => void;
  onError?: (err: Error) => void;
  className?: string;
};

export default function GaussianSplatViewer({
  url,
  fileBytes,
  fileType = 'ply',
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
    if (!url && !fileBytes) {
      setStatus('error');
      setErrorMessage('모델 소스가 지정되지 않았습니다 (url/fileBytes 필요)');
      return;
    }

    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let mesh: THREE.Object3D | null = null;
    let onResize: (() => void) | null = null;

    const scene = new THREE.Scene();
    if (background) scene.background = new THREE.Color(background);

    const profile = quality === 'auto' ? detectDeviceProfile() : quality === 'high' ? 'high' : 'low';

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
      console.error('[viewer] WebGL init failed', e);
      setStatus('error');
      setErrorMessage('WebGL을 지원하지 않는 브라우저입니다.');
      onError?.(e);
      return;
    }

    setStatus('loading');

    (async () => {
      try {
        const { SplatMesh } = await import('@sparkjsdev/spark');
        if (disposed) return;

        // Spark 2.0: SplatMesh 생성자 옵션 — url XOR fileBytes 선택.
        // onLoad/onError 콜백으로 실제 로드 성공/실패 포착.
        const meshOptions: Record<string, unknown> = {
          onLoad: () => {
            if (disposed) return;
            console.info('[viewer] splat loaded');
            // 로드 완료 — 자동 카메라 fit: splat의 bounding box를 구해 카메라 거리 조정.
            // 초기 카메라가 splat 범위와 맞지 않으면 검은 화면이 나오기 때문.
            try {
              const meshAny = mesh as unknown as {
                getBoundingBox?: () => { min: THREE.Vector3; max: THREE.Vector3 };
              };
              if (meshAny?.getBoundingBox && !initialCamera && controls) {
                const box = meshAny.getBoundingBox();
                if (box && box.min && box.max) {
                  const center = new THREE.Vector3()
                    .addVectors(box.min, box.max)
                    .multiplyScalar(0.5);
                  const size = new THREE.Vector3().subVectors(box.max, box.min);
                  const maxDim = Math.max(size.x, size.y, size.z);
                  const fovRad = (camera.fov * Math.PI) / 180;
                  // 여유 padding 1.3배
                  const distance = (maxDim * 1.3) / (2 * Math.tan(fovRad / 2));
                  camera.position.set(center.x, center.y, center.z + distance);
                  controls.target.copy(center);
                  controls.update();
                  console.info(
                    `[viewer] auto-fit camera — center=(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), size=${maxDim.toFixed(2)}, distance=${distance.toFixed(2)}`,
                  );
                }
              }
            } catch (fitErr) {
              console.warn('[viewer] auto-fit failed (non-fatal)', fitErr);
            }
            setStatus('ready');
            onLoad?.();
          },
          onError: (err: unknown) => {
            if (disposed) return;
            const e = err instanceof Error ? err : new Error(String(err));
            console.error('[viewer] splat load error', e);
            setStatus('error');
            setErrorMessage(e.message || '모델을 불러오지 못했습니다.');
            onError?.(e);
          },
        };

        if (fileBytes) {
          meshOptions.fileBytes = fileBytes;
          meshOptions.fileType = fileType;
          console.info(
            `[viewer] loading from fileBytes (${fileBytes.byteLength} bytes, type=${fileType})`,
          );
        } else if (url) {
          meshOptions.url = url;
          console.info(`[viewer] loading from url ${url}`);
        }

        mesh = new SplatMesh(meshOptions as ConstructorParameters<typeof SplatMesh>[0]);

        if (disposed) return;
        scene.add(mesh as unknown as THREE.Object3D);

        // Spark가 onLoad를 호출하지 않는 구버전/엣지 케이스를 대비:
        // 1.5초 안에 ready 상태가 안 되면 일단 ready로 전환 (사용자가 빈 화면을
        // 무한 대기하지 않게). 실제 렌더에 문제가 있어도 OrbitControls는 작동.
        setTimeout(() => {
          if (!disposed) {
            setStatus((prev) => (prev === 'loading' ? 'ready' : prev));
          }
        }, 1500);
      } catch (err) {
        if (disposed) return;
        const e = err instanceof Error ? err : new Error(String(err));
        console.error('[viewer] Spark.js load/construct failed', e);
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
  }, [url, fileBytes, fileType, autoRotate, initialCamera, quality, background, onLoad, onError]);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className ?? ''}`}
      data-status={status}
    >
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-base-400">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          모델 확인중
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-base-0/80 px-6 text-center">
          <p className="text-sm font-semibold text-base-100">모델을 불러오지 못했습니다</p>
          <p className="text-xs text-base-400">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
