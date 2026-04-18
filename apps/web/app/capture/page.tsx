'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Camera,
  X,
  ArrowLeft,
  Stop,
  ArrowsCounterClockwise,
} from '@phosphor-icons/react/dist/ssr';
import JobProgress from '@/components/upload/JobProgress';
import { startMockJob } from '@/lib/mockFlow';

const ViewerShell = dynamic(() => import('@/components/viewer/ViewerShell'), {
  ssr: false,
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
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  // TRELLIS 결과(.glb)를 받았는지 여부 — splat 이 아니라 mesh 뷰어를 써야 함.
  const [resultType, setResultType] = useState<'splat' | 'glb'>('splat');

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      // setCameraActive를 호출하면 React가 video 요소를 DOM에 렌더링한다.
      // 렌더링 직후에 useEffect가 실행되며 그때 videoRef.current에 stream을 붙인다.
      // 이렇게 해야 "버튼 누른 직후 videoRef가 아직 null" 경쟁 조건이 사라진다.
      setCameraActive(true);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setCameraError('카메라 접근이 거부되었습니다. 브라우저 설정에서 허용해주세요.');
      } else if (msg.includes('NotFound')) {
        setCameraError('카메라를 찾을 수 없습니다. 웹캠이 연결되어 있는지 확인해주세요.');
      } else {
        setCameraError(`카메라를 시작할 수 없습니다: ${msg}`);
      }
    }
  }, []);

  // cameraActive가 true가 되어 video 요소가 렌더링된 "다음" 프레임에 stream을 붙인다.
  useEffect(() => {
    if (!cameraActive) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    // play()는 Promise를 반환 — 모바일 autoplay 정책으로 실패하면 조용히 무시
    void video.play().catch((err) => {
      console.warn('[capture] video.play() deferred', err);
    });
  }, [cameraActive]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

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

  const removeFrame = useCallback((id: string) => {
    setFrames((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const submitFrames = useCallback(() => {
    if (frames.length === 0) return;
    stopCamera();
    const thumbnailUrl = frames[0]?.previewUrl ?? '';
    // Blob → File 변환 (gen3d는 File[]을 기대하지만 name만 있으면 됨)
    const files = frames.map(
      (f, i) =>
        new File([f.blob], `capture_${i}.jpg`, { type: f.blob.type || 'image/jpeg' }),
    );
    const id = startMockJob({ thumbnailUrl, files });
    setJobId(id);
    setStep('processing');
  }, [frames, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
      frames.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <nav className="flex items-center justify-between border-b border-base-100 px-5 py-3.5 sm:px-8">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-base-900"
          >
            SplatHub
          </Link>
          <span className="text-sm text-base-500">카메라 캡처</span>
        </div>
        <Link
          href="/"
          className="tactile inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-base-600 transition-colors hover:bg-base-50 hover:text-base-900"
        >
          <ArrowLeft size={13} weight="regular" />
          대시보드
        </Link>
      </nav>

      <main className="flex flex-1 flex-col">
        {step === 'capture' && (
          <>
            <div className="relative flex-1 bg-black">
              {!cameraActive ? (
                <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center animate-slide-up">
                  {cameraError ? (
                    <>
                      <p className="max-w-sm text-sm text-danger">{cameraError}</p>
                      <button
                        type="button"
                        onClick={startCamera}
                        className="tactile inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-base-0"
                      >
                        다시 시도
                      </button>
                    </>
                  ) : (
                    <>
                      <Camera size={40} weight="thin" className="text-base-500" />
                      <div className="flex flex-col gap-1.5">
                        <h1 className="text-2xl font-semibold tracking-tight text-base-900">
                          카메라로 3D 만들기
                        </h1>
                        <p className="max-w-sm text-sm text-base-500">
                          대상을 중앙에 놓고, 천천히 주변을 돌면서 셔터를 눌러주세요.
                          3장 이상이면 변환할 수 있습니다.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={startCamera}
                        className="tactile inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright"
                      >
                        카메라 시작
                      </button>
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
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-56 w-56 rounded-full border border-white/20 sm:h-72 sm:w-72" />
                  </div>
                  <div className="absolute left-5 top-5 font-mono text-sm text-white/90">
                    {String(frames.length).padStart(2, '0')}
                  </div>
                </>
              )}
            </div>

            <div className="safe-bottom border-t border-base-100 px-5 py-4 sm:px-8">
              {frames.length > 0 && (
                <div className="mb-4 flex gap-2 overflow-x-auto">
                  {frames.map((f) => (
                    <div
                      key={f.id}
                      className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md border border-base-200"
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
                        className="tactile absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white"
                      >
                        <X size={9} weight="bold" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {cameraActive && (
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="tactile inline-flex items-center gap-1.5 rounded-md border border-base-200 bg-base-50 px-3 py-2 text-sm text-base-700"
                  >
                    <Stop size={13} weight="regular" />
                    중지
                  </button>
                  <button
                    type="button"
                    onClick={captureFrame}
                    aria-label="촬영"
                    className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-white/10 transition-transform active:scale-90"
                  />
                  <button
                    type="button"
                    onClick={submitFrames}
                    disabled={frames.length < 1}
                    className="tactile inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright disabled:bg-base-200 disabled:text-base-500"
                  >
                    변환 · {frames.length}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {step === 'processing' && jobId && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 animate-fade-in">
            <h2 className="text-2xl font-semibold tracking-tight text-base-900">
              3D 모델 생성 중
            </h2>
            <div className="w-full max-w-md">
              <JobProgress
                jobId={jobId}
                onDone={(snap) => {
                  // TRELLIS 가 반환한 .glb 가 최우선 — mesh 뷰어로.
                  if (snap.result_glb_bytes) {
                    setResultBytes(snap.result_glb_bytes);
                    setResultUrl(null);
                    setResultType('glb');
                  } else if (snap.result_ply_bytes) {
                    setResultBytes(snap.result_ply_bytes);
                    setResultUrl(null);
                    setResultType('splat');
                  } else if (snap.result_ply_url) {
                    setResultUrl(snap.result_ply_url);
                    setResultBytes(null);
                    setResultType('splat');
                  } else {
                    // 실제 변환 결과 없음 — 샘플로 폴백하지 않고 실패로 간주.
                    setCameraError('3D 변환 결과를 받지 못했습니다. 다시 시도해주세요.');
                    setStep('capture');
                    return;
                  }
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

        {step === 'view' && (resultUrl || resultBytes) && (
          <div className="flex flex-1 flex-col animate-scale-in">
            <div className="flex-1">
              <ViewerShell
                url={resultUrl ?? undefined}
                fileBytes={resultBytes ?? undefined}
                fileType={resultType}
                autoRotate
                minimal
              />
            </div>
            <div className="safe-bottom flex items-center justify-center gap-2 border-t border-base-100 px-5 py-4 sm:px-8">
              <button
                type="button"
                onClick={() => {
                  setStep('capture');
                  setJobId(null);
                  setResultUrl(null);
                  setResultBytes(null);
                  setFrames([]);
                }}
                className="tactile inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright"
              >
                <ArrowsCounterClockwise size={13} weight="regular" />
                한 번 더 촬영
              </button>
              <Link
                href="/"
                className="tactile inline-flex items-center gap-1.5 rounded-md border border-base-200 bg-base-50 px-4 py-2 text-sm text-base-700"
              >
                대시보드로
              </Link>
            </div>
          </div>
        )}
      </main>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
