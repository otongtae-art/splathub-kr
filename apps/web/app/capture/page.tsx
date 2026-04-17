'use client';

/**
 * /capture — 웹캠/스마트폰 카메라 실시간 캡처.
 *
 * 사용자가 대상 주변을 돌면서 촬영하면 자동/수동으로 프레임을 캡처하고,
 * 충분한 장수가 모이면 /api/upload/file + /api/jobs 로 변환을 시작한다.
 *
 * 비개발자도 스마트폰 웹 브라우저에서 직관적으로 쓸 수 있어야 한다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import JobProgress from '@/components/upload/JobProgress';

const ViewerShell = dynamic(() => import('@/components/viewer/ViewerShell'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-ink-400">
      뷰어 준비 중…
    </div>
  ),
});

type CapturedFrame = {
  id: string;
  blob: Blob;
  previewUrl: string;
};

export default function CapturePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [step, setStep] = useState<'capture' | 'processing' | 'view'>('capture');
  const [jobId, setJobId] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  // 카메라 시작
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // 후면 카메라 우선 (모바일)
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setCameraError('카메라 접근이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요.');
      } else if (msg.includes('NotFound')) {
        setCameraError('카메라를 찾을 수 없습니다. 웹캠이 연결되어 있는지 확인해주세요.');
      } else {
        setCameraError(`카메라를 시작할 수 없습니다: ${msg}`);
      }
    }
  }, []);

  // 카메라 중지
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  // 셔터 — 현재 비디오 프레임을 캡처
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const frame: CapturedFrame = {
          id: `frame-${Date.now()}`,
          blob,
          previewUrl: URL.createObjectURL(blob),
        };
        setFrames((prev) => [...prev, frame]);
      },
      'image/jpeg',
      0.92,
    );
  }, []);

  // 프레임 삭제
  const removeFrame = useCallback((id: string) => {
    setFrames((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // 변환 시작
  const submitFrames = useCallback(async () => {
    if (frames.length === 0) return;
    stopCamera();
    setStep('processing');

    try {
      // 로컬 업로드
      const formData = new FormData();
      frames.forEach((f, i) => {
        formData.append('files', f.blob, `capture_${i}.jpg`);
      });

      const uploadRes = await fetch('/api/upload/file', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('upload_failed');

      const { uploads } = (await uploadRes.json()) as {
        uploads: Array<{ upload_id: string }>;
      };

      // Job 생성
      const jobRes = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          upload_ids: uploads.map((u) => u.upload_id),
          kind: 'photo_to_splat',
          source: 'capture',
        }),
      });
      if (!jobRes.ok) throw new Error('job_failed');

      const { job_id } = (await jobRes.json()) as { job_id: string };
      setJobId(job_id);
    } catch (err) {
      setCameraError((err as Error).message);
      setStep('capture');
    }
  }, [frames, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      frames.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink-900">
      {/* 상단 */}
      <nav className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-bold text-accent-500">
            SplatHub
          </Link>
          <span className="text-sm text-ink-400">카메라 캡처</span>
        </div>
        <Link href="/" className="text-xs text-ink-400 hover:text-ink-100">
          ← 대시보드
        </Link>
      </nav>

      <main className="flex flex-1 flex-col">
        {/* 캡처 단계 */}
        {step === 'capture' && (
          <>
            {/* 카메라 뷰 */}
            <div className="relative flex-1 bg-black">
              {!cameraActive ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                  {cameraError ? (
                    <>
                      <p className="text-sm text-red-300">{cameraError}</p>
                      <button
                        type="button"
                        onClick={startCamera}
                        className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-900"
                      >
                        다시 시도
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-4xl">📷</div>
                      <p className="text-lg font-semibold text-ink-100">
                        카메라로 3D 모델 만들기
                      </p>
                      <p className="max-w-sm text-sm text-ink-300">
                        대상을 중앙에 놓고, 천천히 주변을 돌면서 셔터를 눌러주세요.
                        3장 이상이면 변환할 수 있어요.
                      </p>
                      <button
                        type="button"
                        onClick={startCamera}
                        className="rounded-lg bg-accent-500 px-6 py-3 text-base font-semibold text-ink-900 shadow-lg shadow-accent-500/20"
                      >
                        카메라 시작
                      </button>
                      <Link
                        href="/"
                        className="text-xs text-ink-400 hover:text-ink-100"
                      >
                        파일 업로드로 돌아가기
                      </Link>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                  {/* 가이드 오버레이 */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-48 w-48 rounded-full border-2 border-white/20 sm:h-64 sm:w-64" />
                  </div>
                  {/* 캡처 카운트 */}
                  <div className="absolute left-4 top-4 rounded-full bg-ink-900/80 px-3 py-1 text-sm font-semibold text-ink-50">
                    {frames.length}장 촬영됨
                  </div>
                </>
              )}
            </div>

            {/* 하단 컨트롤 */}
            <div className="safe-bottom border-t border-ink-800 bg-ink-900 p-4">
              {/* 캡처된 프레임 썸네일 */}
              {frames.length > 0 && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-2">
                  {frames.map((f) => (
                    <div
                      key={f.id}
                      className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-ink-700"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeFrame(f.id)}
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] text-white"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-center gap-4">
                {cameraActive && (
                  <>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="rounded-lg border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-ink-200"
                    >
                      중지
                    </button>
                    <button
                      type="button"
                      onClick={captureFrame}
                      className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/10 text-2xl shadow-lg transition active:scale-90"
                    >
                      📸
                    </button>
                    <button
                      type="button"
                      onClick={submitFrames}
                      disabled={frames.length < 1}
                      className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-ink-900 disabled:opacity-40"
                    >
                      변환 ({frames.length})
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* 변환 진행 */}
        {step === 'processing' && jobId && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
            <h2 className="text-xl font-semibold">3D 모델 생성 중...</h2>
            <div className="w-full max-w-md">
              <JobProgress
                jobId={jobId}
                onDone={() => {
                  setResultUrl('/samples/bonsai.spz'); // TODO: 실제 결과 URL
                  setStep('view');
                }}
                onError={() => {
                  setStep('capture');
                  setCameraError('변환에 실패했습니다. 다시 촬영해주세요.');
                }}
              />
            </div>
          </div>
        )}

        {/* 결과 뷰어 */}
        {step === 'view' && resultUrl && (
          <div className="flex flex-1 flex-col">
            <div className="flex-1">
              <ViewerShell url={resultUrl} autoRotate minimal />
            </div>
            <div className="flex items-center justify-center gap-3 border-t border-ink-800 p-4 safe-bottom">
              <button
                type="button"
                onClick={() => {
                  setStep('capture');
                  setJobId(null);
                  setResultUrl(null);
                  setFrames([]);
                }}
                className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-900"
              >
                한 번 더 촬영
              </button>
              <Link
                href="/"
                className="rounded-lg border border-ink-600 bg-ink-800 px-5 py-2.5 text-sm text-ink-100"
              >
                대시보드로
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* 숨겨진 캔버스 (프레임 캡처용) */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
