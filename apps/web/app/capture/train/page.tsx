'use client';

/**
 * `/capture/train` — 캡처된 사진들로 VGGT photogrammetry 학습.
 *
 * VGGT (Meta, CVPR 2025 Best Paper) 가 우리 HF Space wrapper 를 통해 실행됨.
 * 서버 GPU 비용 $0 (ZeroGPU 무료 티어), 사용자는 브라우저 안에서 바로 결과 확인.
 *
 * 흐름:
 *   1. /capture 에서 촬영된 File[] 을 window.__capturedShots 로 받음
 *   2. "3D 학습 시작" 버튼 → VGGT 호출 (~30~60초)
 *   3. 반환된 .glb 를 MeshViewer 에 바로 표시
 *   4. (선택) Brush WebGPU 로 로컬 학습도 가능
 */

import {
  ArrowLeft,
  CheckCircle,
  Cpu,
  DownloadSimple,
  PlayCircle,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  getLatestSessionId,
  loadCaptures,
  type CaptureMeta,
} from '@/lib/captureStore';
import type { ViewerStats } from '@/components/viewer/MeshViewer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { callHfSpace, callVggt } from '@/lib/hfSpace';
import { usePWAInstall } from '@/lib/usePWAInstall';

const MeshViewer = dynamic(() => import('@/components/viewer/MeshViewer'), {
  ssr: false,
});

type Stage = 'loading' | 'ready' | 'training' | 'done' | 'error';

const BRUSH_DEMO_URL = 'https://splats.arthurbrussee.com/';

export default function CaptureTrainPage() {
  const [meta, setMeta] = useState<CaptureMeta | null>(null);
  const [shots, setShots] = useState<File[] | null>(null);
  // round 18 — R7 자동 제외된 흐림 사진들 (IndexedDB 에서 로드)
  const [droppedShots, setDroppedShots] = useState<File[] | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [progress, setProgress] = useState<{ frac: number; label: string }>({
    frac: 0,
    label: '',
  });
  const [glbBytes, setGlbBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerStats, setViewerStats] = useState<ViewerStats | null>(null);
  // round 19 — VGGT monster 시 TRELLIS.2 (1장 generative AI) fallback
  const [trellisState, setTrellisState] = useState<
    'idle' | 'loading' | 'done' | 'error'
  >('idle');
  const [trellisError, setTrellisError] = useState<string | null>(null);
  const [trellisProgress, setTrellisProgress] = useState<{
    frac: number;
    label: string;
  }>({ frac: 0, label: '' });
  // round 25 — VGGT 결과 보존 + TRELLIS 결과 별도 보관, 토글로 전환
  const [vggtBytes, setVggtBytes] = useState<Uint8Array | null>(null);
  const [trellisBytes, setTrellisBytes] = useState<Uint8Array | null>(null);
  const [activeView, setActiveView] = useState<'vggt' | 'trellis'>('vggt');
  // round 27 — 다운로드 후 사용 가이드 toast (1회 표시, sessionStorage 로 dismissed 추적)
  const [showDownloadGuide, setShowDownloadGuide] = useState(false);
  // round 39 — PWA 'home 화면에 추가' 안내
  const pwa = usePWAInstall();
  const thumbnailGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) IndexedDB 에서 최신 세션 로드 시도
      const sessionId = getLatestSessionId();
      if (sessionId) {
        try {
          const data = await loadCaptures(sessionId);
          if (data && !cancelled) {
            setShots(data.files);
            setMeta(data.meta);
            setDroppedShots(data.droppedFiles ?? null);
            setStage('ready');
            console.info(
              `[train] loaded ${data.files.length} files from IndexedDB (${sessionId})${
                data.droppedFiles ? `, ${data.droppedFiles.length} dropped` : ''
              }`,
            );
            return;
          }
        } catch (err) {
          console.warn('[train] IndexedDB load failed:', err);
        }
      }

      // 2) fallback: window 변수 (이전 방식, SPA 내에서만 동작)
      const files = (window as Window & { __capturedShots?: File[] })
        .__capturedShots;
      if (files && files.length > 0 && !cancelled) {
        setShots(files);
        setMeta({ count: files.length, timestamp: Date.now() });
        setStage('ready');
        console.info(`[train] fallback: loaded ${files.length} files from window`);
        return;
      }

      // 3) 둘 다 실패 → error
      if (!cancelled) {
        setStage('error');
        setError('촬영 데이터를 찾을 수 없습니다. 다시 촬영해주세요.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!shots || !thumbnailGridRef.current) return;
    const container = thumbnailGridRef.current;
    container.innerHTML = '';
    shots.forEach((f) => {
      const url = URL.createObjectURL(f);
      const img = document.createElement('img');
      img.src = url;
      img.className = 'aspect-square w-full object-cover rounded';
      img.onload = () => URL.revokeObjectURL(url);
      container.appendChild(img);
    });
  }, [shots]);

  const startTraining = async () => {
    if (!shots || shots.length < 2) return;
    setStage('training');
    setError(null);
    setProgress({ frac: 0, label: '초기화' });
    try {
      const result = await callVggt(shots, {
        onProgress: (frac, label) => {
          setProgress({ frac, label: label ?? '' });
        },
      });
      setGlbBytes(result.bytes);
      setStage('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[train] VGGT failed', err);
      setError(msg);
      setStage('ready'); // 다시 시도 가능
      setProgress({ frac: 0, label: '' });
    }
  };

  // round 19+20: TRELLIS.2 (1장 generative) 폴백 — VGGT monster 시 세션 구제
  // round 20: meta.sharpnessScores 가 있으면 가장 sharp 한 shot 선택,
  // 없으면 (구버전 호환) 첫 번째 사진 사용.
  const tryTrellisFallback = async () => {
    if (!shots || shots.length === 0) return;
    let photo: File | undefined = shots[0];
    const scores = meta?.sharpnessScores;
    if (scores && scores.length === shots.length) {
      let bestIdx = 0;
      let bestScore = -1;
      for (let i = 0; i < scores.length; i++) {
        const s = scores[i] ?? 0;
        if (s > bestScore) {
          bestScore = s;
          bestIdx = i;
        }
      }
      photo = shots[bestIdx];
      console.info(
        `[train] TRELLIS fallback: picked shot[${bestIdx}] (sharpness=${bestScore.toFixed(0)} of ${scores.length} scores)`,
      );
    }
    if (!photo) return;
    setTrellisState('loading');
    setTrellisError(null);
    setTrellisProgress({ frac: 0, label: 'TRELLIS.2 호출' });
    // round 25: 현재 VGGT 결과를 보존 (이후 토글로 전환 가능)
    if (glbBytes && !vggtBytes) {
      setVggtBytes(glbBytes);
    }
    try {
      const result = await callHfSpace(photo, {
        onProgress: (frac, label) =>
          setTrellisProgress({ frac, label: label ?? '' }),
      });
      // round 25: TRELLIS 결과 별도 보관 + 활성 뷰 전환
      setTrellisBytes(result.bytes);
      setGlbBytes(result.bytes);
      setActiveView('trellis');
      setViewerStats(null); // 새 모델에 대한 통계는 재측정 필요
      setTrellisState('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[train] TRELLIS fallback failed', err);
      setTrellisError(msg);
      setTrellisState('error');
    }
  };

  const downloadGlb = () => {
    if (!glbBytes) return;
    const blob = new Blob([glbBytes as BlobPart], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // round 26: 활성 view 기반 파일명 — 사용자가 무엇을 받는지 명확
    const prefix =
      activeView === 'trellis' ? 'splathub-trellis-ai' : 'splathub-vggt';
    a.download = `${prefix}-${Date.now()}.glb`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    // round 27: 첫 다운로드 시 사용 가이드 toast (세션 1회만)
    try {
      const seen = sessionStorage.getItem('splathub:dl-guide-seen');
      if (!seen) {
        setShowDownloadGuide(true);
        sessionStorage.setItem('splathub:dl-guide-seen', '1');
      }
    } catch {
      /* sessionStorage 차단 환경 무시 */
    }
  };

  // IndexedDB 에서 로딩 중
  if (stage === 'loading') {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-accent/30" />
        <p className="text-sm text-base-500">촬영 데이터 불러오는 중...</p>
      </main>
    );
  }

  // 로딩 실패 (IndexedDB 에 데이터 없음)
  if (!shots || stage === 'error') {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <Warning size={36} weight="regular" className="text-amber-500" />
        <h1 className="text-xl font-semibold text-base-900">
          촬영 데이터를 찾을 수 없습니다
        </h1>
        <p className="text-sm text-base-500">
          {error || '이전 촬영 데이터가 없거나 만료되었습니다. 새로 촬영해주세요.'}
        </p>
        <Link
          href="/capture"
          className="tactile mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-base-0"
        >
          촬영 시작
        </Link>
      </main>
    );
  }

  // 결과 표시 모드
  if (stage === 'done' && glbBytes) {
    // monster 의심 휴리스틱 — VGGT photogrammetry 결과에만 적용
    // (R5 trim/flatness 는 pointcloud 전용. TRELLIS 는 mesh 라 의미 없음)
    const monsterSuspect =
      activeView === 'vggt' &&
      viewerStats !== null &&
      (viewerStats.flatness < 0.15 || viewerStats.retainedCount < 5000);

    return (
      <div className="flex min-h-[100dvh] flex-col">
        <header className="flex items-center justify-between border-b border-base-100 bg-base-0 px-5 py-2 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-base-500 transition-colors hover:text-base-800"
          >
            <ArrowLeft size={13} weight="regular" />
            홈으로
          </Link>
          <div className="flex items-center gap-3 text-xs text-base-500">
            {/* round 25: VGGT/TRELLIS 토글 (둘 다 있을 때) */}
            {vggtBytes && trellisBytes ? (
              <div className="inline-flex overflow-hidden rounded border border-base-200">
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('vggt');
                    setGlbBytes(vggtBytes);
                    setViewerStats(null); // 다시 measurement
                  }}
                  className={`px-2 py-0.5 text-[11px] transition-colors ${
                    activeView === 'vggt'
                      ? 'bg-accent text-base-0'
                      : 'bg-base-50 text-base-600 hover:bg-base-100'
                  }`}
                >
                  VGGT (실측)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('trellis');
                    setGlbBytes(trellisBytes);
                    setViewerStats(null);
                  }}
                  className={`px-2 py-0.5 text-[11px] transition-colors ${
                    activeView === 'trellis'
                      ? 'bg-amber-500/80 text-base-0'
                      : 'bg-base-50 text-base-600 hover:bg-base-100'
                  }`}
                >
                  TRELLIS (AI)
                </button>
              </div>
            ) : activeView === 'trellis' ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  AI 생성
                </span>
                <span>TRELLIS.2 · 1장 기반 (실측 X)</span>
              </span>
            ) : (
              <span>VGGT · photogrammetry · {shots.length}장</span>
            )}
            {viewerStats && activeView === 'vggt' && (
              <span
                className="font-mono text-base-400"
                title={`Pointcloud: ${viewerStats.retainedCount.toLocaleString()} points / 평탄도(flatness) ${(viewerStats.flatness * 100).toFixed(1)}% — depth/width 비율, 작을수록 평면적`}
              >
                {/* round 33: mobile 에서도 보이게. 짧은 약식 → sm 부터 풀 라벨 */}
                <span className="sm:hidden">
                  {Math.round(viewerStats.retainedCount / 1000)}k·
                  {(viewerStats.flatness * 100).toFixed(0)}%
                </span>
                <span className="hidden sm:inline">
                  {viewerStats.retainedCount.toLocaleString()}pts ·{' '}
                  평탄도 {(viewerStats.flatness * 100).toFixed(0)}%
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={downloadGlb}
              className="inline-flex items-center gap-1 text-base-700 transition-colors hover:text-base-900"
            >
              <DownloadSimple size={12} weight="regular" />
              .glb 다운로드
            </button>
          </div>
        </header>
        {monsterSuspect && (
          <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/[0.06] px-5 py-2.5 text-xs">
            <Warning
              size={14}
              weight="regular"
              className="mt-0.5 flex-shrink-0 text-amber-500"
            />
            <div className="flex flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
              <span className="font-medium text-amber-700 dark:text-amber-400">
                결과가 평면적이거나 sparse 합니다
              </span>
              <span className="text-base-500">
                {viewerStats!.flatness < 0.15
                  ? `깊이 ${(viewerStats!.flatness * 100).toFixed(0)}% — 카메라가 한 방향만 본 듯`
                  : `점 ${viewerStats!.retainedCount.toLocaleString()}개 — 너무 sparse`}
              </span>
              <div className="ml-auto flex items-center gap-3 whitespace-nowrap">
                {/* round 19: TRELLIS.2 폴백 */}
                {trellisState === 'idle' && (
                  <button
                    type="button"
                    onClick={tryTrellisFallback}
                    className="tactile rounded border border-amber-500/40 bg-amber-500/[0.1] px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-500/[0.2] dark:text-amber-300"
                  >
                    🪄 TRELLIS.2 (1장 AI)
                  </button>
                )}
                {trellisState === 'loading' && (
                  <span className="font-mono text-amber-700 dark:text-amber-400">
                    {Math.round(trellisProgress.frac * 100)}%{' '}
                    {trellisProgress.label}
                  </span>
                )}
                {trellisState === 'error' && (
                  <span className="text-danger" title={trellisError ?? ''}>
                    ✗ TRELLIS 실패
                  </span>
                )}
                <Link
                  href="/capture"
                  className="text-amber-700 underline transition-colors hover:text-amber-900 dark:text-amber-400"
                >
                  다시 촬영하기 →
                </Link>
              </div>
            </div>
          </div>
        )}
        <div className="relative flex-1">
          {/* round 35: ErrorBoundary 로 감싸 Three.js / WebGL 크래시 시 white-screen 방지 */}
          <ErrorBoundary
            fallback={(err) => (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-base-0 p-6 text-center">
                <p className="text-sm font-medium text-danger">3D 뷰어 오류</p>
                <p className="max-w-sm text-xs text-base-500">
                  {err.message || 'WebGL 또는 GLB 파싱 실패'}
                </p>
                <p className="text-[11px] text-base-400">
                  Chrome 134+ 권장. 메모리 부족 시 다른 탭 닫고 재시도.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadGlb}
                    className="tactile rounded-md border border-base-200 bg-base-50 px-3 py-1.5 text-xs text-base-700 hover:border-base-300"
                  >
                    .glb 다운로드만
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="tactile rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-base-0"
                  >
                    페이지 새로고침
                  </button>
                </div>
              </div>
            )}
          >
            <MeshViewer
              fileBytes={glbBytes}
              autoRotate
              onStats={setViewerStats}
            />
          </ErrorBoundary>
          {/* round 46: VGGT 통계 확장 패널 — VGGT 모드일 때만 (TRELLIS 는 무관) */}
          {viewerStats && activeView === 'vggt' && (
            <details className="absolute right-4 top-4 max-w-xs animate-fade-in">
              <summary className="tactile cursor-pointer rounded-md border border-base-200 bg-base-0/90 px-2 py-1 text-[10px] text-base-600 shadow-sm backdrop-blur hover:border-base-300 hover:text-base-900">
                📊 자세히
              </summary>
              <div className="mt-1 flex flex-col gap-1.5 rounded-md border border-base-200 bg-base-0/95 p-3 text-[11px] text-base-700 shadow-lg backdrop-blur">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
                  <span className="text-base-500">원본 점</span>
                  <span className="text-right">{viewerStats.pointsCount.toLocaleString()}</span>
                  <span className="text-base-500">유지 (5-95%)</span>
                  <span className="text-right">{viewerStats.retainedCount.toLocaleString()}</span>
                  <span className="text-base-500">bbox max</span>
                  <span className="text-right">{viewerStats.bboxDim.toFixed(2)} m</span>
                  <span className="text-base-500">bbox min (depth)</span>
                  <span className="text-right">{viewerStats.depthSpread.toFixed(2)} m</span>
                  <span className="text-base-500">평탄도</span>
                  <span className="text-right">{(viewerStats.flatness * 100).toFixed(1)} %</span>
                  {meta?.sectorsCovered !== undefined && (
                    <>
                      <span className="text-base-500">각도 커버</span>
                      <span className="text-right">{meta.sectorsCovered}/36 ({Math.round(meta.sectorsCovered / 36 * 100)}%)</span>
                    </>
                  )}
                  {meta?.droppedBlurry !== undefined && (
                    <>
                      <span className="text-base-500">사진 (흐림 제외)</span>
                      <span className="text-right">{shots.length} ({meta.droppedBlurry} drop)</span>
                    </>
                  )}
                </div>
                <p className="border-t border-base-200 pt-1.5 text-[10px] leading-snug text-base-500">
                  평탄도 &lt; 15% = 평면 layer 의심 (monster). 30%+ = 정상 객체.
                </p>
              </div>
            </details>
          )}

          {/* round 27+39+40: 다운로드 가이드 + PWA 설치 (Android prompt + iOS 수동 안내) */}
          {(showDownloadGuide ||
            (pwa.canInstall && !pwa.installed && !pwa.dismissed) ||
            (pwa.isIOS && !pwa.installed && !pwa.dismissed)) && (
            <div className="pointer-events-auto absolute bottom-4 left-1/2 max-w-md -translate-x-1/2 px-4 animate-fade-in">
              <div className="flex flex-col gap-2 rounded-md border border-accent/40 bg-black/90 px-3.5 py-2.5 text-xs text-white shadow-xl backdrop-blur-md">
                {showDownloadGuide && (
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-accent">📂</span>
                    <div className="flex flex-1 flex-col gap-1">
                      <p className="font-medium">다운로드 완료 · 사용 방법</p>
                      <p className="text-[11px] text-white/75 leading-relaxed">
                        빠른 미리보기:{' '}
                        <a
                          href="https://gltf-viewer.donmccurdy.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent underline transition-colors hover:text-accent-bright"
                        >
                          gltf-viewer.donmccurdy.com
                        </a>
                        {' '}에 .glb 끌어 놓기. Blender/Unity/Three.js 도 .glb import 직접 지원.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDownloadGuide(false)}
                      aria-label="가이드 닫기"
                      className="tactile rounded text-[10px] text-white/60 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {/* round 39: PWA 설치 안내 — beforeinstallprompt 발생한 사용자 (Android Chrome 등) */}
                {pwa.canInstall && !pwa.installed && !pwa.dismissed && (
                  <div
                    className={`flex items-start gap-2.5 ${showDownloadGuide ? 'border-t border-white/10 pt-2' : ''}`}
                  >
                    <span className="mt-0.5 text-accent">📱</span>
                    <div className="flex flex-1 flex-col gap-1">
                      <p className="font-medium">홈 화면에 추가</p>
                      <p className="text-[11px] text-white/75 leading-relaxed">
                        다음 촬영 시 native 앱처럼 풀스크린 + 1탭 접근.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void pwa.install();
                      }}
                      className="tactile rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-base-0 hover:bg-accent-bright"
                    >
                      추가
                    </button>
                    <button
                      type="button"
                      onClick={pwa.dismiss}
                      aria-label="설치 안내 닫기"
                      className="tactile rounded text-[10px] text-white/60 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {/* round 40: iOS 수동 안내 — Safari 는 beforeinstallprompt 미지원 */}
                {pwa.isIOS && !pwa.canInstall && !pwa.installed && !pwa.dismissed && (
                  <div
                    className={`flex items-start gap-2.5 ${showDownloadGuide ? 'border-t border-white/10 pt-2' : ''}`}
                  >
                    <span className="mt-0.5 text-accent">📱</span>
                    <div className="flex flex-1 flex-col gap-1">
                      <p className="font-medium">iPhone — 홈 화면에 추가</p>
                      <p className="text-[11px] text-white/75 leading-relaxed">
                        Safari 하단 <span className="font-mono">⎋ 공유</span> 버튼 →
                        <b> &lsquo;홈 화면에 추가&rsquo;</b>. 풀스크린 + 1탭 접근.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={pwa.dismiss}
                      aria-label="iOS 안내 닫기"
                      className="tactile rounded text-[10px] text-white/60 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col gap-6 px-6 py-10 safe-top safe-bottom sm:px-10">
      <Link
        href="/capture"
        className="inline-flex items-center gap-1 text-xs text-base-500 transition-colors hover:text-base-800"
      >
        <ArrowLeft size={11} weight="regular" />
        촬영으로 돌아가기
      </Link>

      <header className="flex flex-col gap-2 animate-slide-up">
        <h1 className="text-2xl font-semibold tracking-tight text-base-900">
          3D 학습 준비 완료
        </h1>
        <p className="max-w-[55ch] text-sm text-base-500">
          촬영한 사진들을 Meta VGGT (CVPR 2025 Best Paper) 로 실제 3D 재구성.
          AI 환각이 아닌 <b>실측 기반 photogrammetry</b>. 서버 비용 $0.
        </p>
      </header>

      {/* 메타 */}
      <section className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-base-500 animate-fade-in">
        <span>📸 사진 {shots.length}장</span>
        {meta?.sectorsCovered !== undefined && (
          <span>📐 각도 {meta.sectorsCovered}/36구간</span>
        )}
        {meta?.droppedBlurry !== undefined && meta.droppedBlurry > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            🌀 흐림 {meta.droppedBlurry}장 자동 제외
          </span>
        )}
        <span>
          💾 {(shots.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(2)} MB
        </span>
      </section>

      {/* 썸네일 그리드 */}
      <section className="animate-fade-in">
        <div
          ref={thumbnailGridRef}
          className="grid grid-cols-5 gap-1 sm:grid-cols-8"
        />
      </section>

      {/* round 18: dropped 사진 collapsible 미리보기 — 사용자에게 transparency */}
      {droppedShots && droppedShots.length > 0 && (
        <details className="text-xs text-base-500 animate-fade-in">
          <summary className="cursor-pointer hover:text-base-700">
            🌀 흐림 자동 제외 {droppedShots.length}장 보기
          </summary>
          <div className="mt-2 grid grid-cols-5 gap-1 sm:grid-cols-8">
            {droppedShots.map((f, i) => {
              const url = URL.createObjectURL(f);
              return (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={i}
                  src={url}
                  alt={`흐림 ${i + 1}`}
                  className="aspect-square w-full rounded border border-danger/40 object-cover opacity-70"
                  onLoad={() => URL.revokeObjectURL(url)}
                />
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-base-400">
            sharpness 낮은 사진은 VGGT 의 카메라 포즈 추정을 흐트러뜨려
            자동 제외됨. 더 안정된 손으로 다시 찍으면 다음엔 모두 활용됨.
          </p>
        </details>
      )}

      {/* 카메라 움직임 검증 — 자이로 데이터로 판정 */}
      {stage === 'ready' && meta?.orientations && (() => {
        const alphas = meta.orientations
          .filter((o): o is { alpha: number; beta: number; gamma: number } => o !== null)
          .map((o) => o.alpha);
        if (alphas.length < 3) return null; // 자이로 없음 (데스크톱)
        const range = Math.max(...alphas) - Math.min(...alphas);
        // 60도 미만 = 카메라가 거의 안 움직임
        if (range < 60) {
          return (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/[0.05] p-4 text-sm animate-fade-in">
              <Warning size={16} weight="regular" className="mt-0.5 flex-shrink-0 text-amber-500" />
              <div className="flex flex-col gap-1">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  카메라가 충분히 움직이지 않았습니다 (각도 범위 {range.toFixed(0)}°)
                </p>
                <p className="text-xs text-base-500">
                  photogrammetry 는 <b>카메라가 공간에서 실제로 이동한 다양한 각도</b>를
                  비교해서 3D 를 계산합니다. 물체를 회전시켰거나 한 자리에서만 찍으면
                  VGGT 가 평면 이미지만 만들어냅니다. 다시 촬영해 주세요 (최소 120° 이상 권장).
                </p>
                <Link
                  href="/capture"
                  className="mt-1 inline-block text-xs text-amber-700 underline hover:text-amber-900 dark:text-amber-400"
                >
                  다시 촬영하기 →
                </Link>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* 메인 액션 */}
      {stage === 'ready' && (
        <section className="flex flex-col gap-4 rounded-md border border-base-200 bg-base-50 p-6 animate-fade-in">
          <div className="flex items-center gap-2">
            <Cpu size={16} weight="regular" className="text-accent" />
            <h2 className="text-sm font-medium text-base-900">
              Meta VGGT · Visual Geometry Grounded Transformer
            </h2>
          </div>
          <ul className="flex flex-col gap-1.5 text-xs text-base-600">
            <li>• <b>CVPR 2025 Best Paper Award</b> — 현재 SOTA photogrammetry</li>
            <li>• 실측 기반 (pose + depth 를 동시에 추정) — AI 환각 없음</li>
            <li>• 예상 소요: {shots.length}장 기준 약 {Math.max(20, shots.length * 2)}~{shots.length * 3}초</li>
            <li>• 비용: $0 (Meta 공식 HF Space, ZeroGPU 무료 티어)</li>
          </ul>
          <div className="rounded-md bg-base-100/50 p-3 text-[11px] text-base-500">
            💡 <b>좋은 결과의 조건</b>: 물체는 가만히 두고 카메라가 주변 한 바퀴 이동,
            각 사진마다 20~30° 다른 각도, 충분한 조명, 배경에 질감 있으면 더 좋음.
          </div>
          <button
            type="button"
            onClick={startTraining}
            disabled={shots.length < 2}
            className="tactile mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright disabled:bg-base-200 disabled:text-base-500"
          >
            <PlayCircle size={16} weight="regular" />
            3D 학습 시작
          </button>
        </section>
      )}

      {/* 학습 중 */}
      {stage === 'training' && (
        <section className="flex flex-col gap-3 rounded-md border border-accent/30 bg-accent/[0.04] p-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-base-900">학습 진행 중</span>
            <span className="font-mono text-xs text-base-500">
              {Math.round(progress.frac * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-100">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${progress.frac * 100}%` }}
            />
          </div>
          <p className="text-xs text-base-500">{progress.label}</p>
        </section>
      )}

      {/* VGGT 실패 시 에러 메시지 (round 32: 분류 + TRELLIS 폴백 버튼) */}
      {stage === 'ready' && error && (() => {
        const cls = classifyVggtError(error);
        return (
          <section className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/[0.04] p-4 text-sm animate-fade-in">
            <div className="flex items-center gap-2">
              <Warning size={14} weight="regular" className="text-danger" />
              <span className="font-medium text-danger">{cls.title}</span>
            </div>
            <p className="text-xs text-base-500 break-all">{error}</p>
            <p className="text-[11px] text-base-400 leading-relaxed">{cls.advice}</p>
            {/* round 32: VGGT 완전 실패 시에도 TRELLIS.2 1장 폴백 옵션 제공 */}
            {trellisState !== 'done' && shots.length > 0 && (
              <div className="flex items-center gap-3 pt-1 text-xs">
                {trellisState === 'idle' && (
                  <button
                    type="button"
                    onClick={tryTrellisFallback}
                    className="tactile rounded border border-amber-500/40 bg-amber-500/[0.1] px-2.5 py-1 text-amber-700 transition-colors hover:bg-amber-500/[0.2] dark:text-amber-300"
                  >
                    🪄 1장 AI 로 시도 (TRELLIS.2)
                  </button>
                )}
                {trellisState === 'loading' && (
                  <span className="font-mono text-amber-700 dark:text-amber-400">
                    {Math.round(trellisProgress.frac * 100)}% {trellisProgress.label}
                  </span>
                )}
                {trellisState === 'error' && (
                  <span className="text-danger" title={trellisError ?? ''}>
                    ✗ TRELLIS 도 실패
                  </span>
                )}
                <span className="text-base-400">
                  사진 1장 (best sharp) 으로 대신 생성
                </span>
              </div>
            )}
          </section>
        );
      })()}

      {/* 고급: Brush WebGPU 로 로컬 학습 (옵션) */}
      {stage === 'ready' && (
        <section className="flex flex-col gap-3 rounded-md border border-dashed border-base-200 p-5 text-xs text-base-500 animate-fade-in">
          <p className="font-medium text-base-700">고급: 완전 오프라인 학습</p>
          <p>
            GPU 가 좋다면 Brush (Apache 2.0) 로 브라우저에서 직접 학습 가능.
            VGGT 보다 오래 걸리지만 (5~15분) 결과 품질이 더 높을 수 있음.
          </p>
          <a
            href={BRUSH_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-base-700 underline transition-colors hover:text-base-900"
          >
            Brush 데모 열기 →
          </a>
        </section>
      )}
    </main>
  );
}

/**
 * VGGT 호출 에러 분류 — round 32.
 * 에러 메시지 패턴 매칭으로 사용자에게 actionable 한 advice 제공.
 */
function classifyVggtError(msg: string): { title: string; advice: string } {
  const m = msg.toLowerCase();
  if (
    m.includes('quota') ||
    m.includes('rate limit') ||
    m.includes('429') ||
    m.includes('exceeded')
  ) {
    return {
      title: 'ZeroGPU 쿼터 소진',
      advice:
        '무료 GPU 티어가 다음 갱신까지 대기 필요 (~30분). 잠시 후 다시 시도하거나 아래 1장 AI 시도.',
    };
  }
  if (m.includes('timeout') || m.includes('timed out') || m.includes('120')) {
    return {
      title: '120초 GPU 한도 초과',
      advice:
        'ZeroGPU 무료 티어는 120초 한도. 사진 수가 너무 많거나 객체가 너무 복잡. 사진 25장 이하 + 단순한 객체 권장.',
    };
  }
  if (
    m.includes('cuda') ||
    m.includes('out of memory') ||
    m.includes('oom')
  ) {
    return {
      title: 'GPU 메모리 부족',
      advice:
        '사진 수를 줄여서 다시 시도 (15-20장 권장). 또는 아래 1장 AI 옵션.',
    };
  }
  if (
    m.includes('network') ||
    m.includes('fetch') ||
    m.includes('failed to load') ||
    m.includes('502') ||
    m.includes('503') ||
    m.includes('504')
  ) {
    return {
      title: '네트워크 또는 서버 오류',
      advice:
        'HF Space 가 잠시 응답하지 않음. 인터넷 연결 확인 + 1분 후 재시도.',
    };
  }
  if (m.includes('cancelled') || m.includes('aborted')) {
    return {
      title: '요청 중단',
      advice: '브라우저가 요청을 중단함. 다시 시도하면 됩니다.',
    };
  }
  return {
    title: '학습 실패',
    advice:
      '예상치 못한 오류. 다시 시도하거나, 아래 1장 AI 옵션을 사용해 결과물을 받아보세요.',
  };
}
