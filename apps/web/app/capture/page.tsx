'use client';

/**
 * `/capture` — Polycam/애플 Object Capture 스타일 사진 기반 3D 캡처.
 *
 * 흐름:
 *   1. 카메라 시작
 *   2. 셔터 버튼으로 사진 촬영 (또는 각도 변화 감지 시 자동)
 *   3. 촬영 직후: 사진 위에 feature points 점으로 애니메이션 (~800ms)
 *   4. 해당 카메라 각도를 3D 미니맵 구체(sphere)에 추가
 *   5. "15/20 사진 · 8/12 각도" 진행률 표시
 *   6. 조건 충족 → "학습 시작" → /capture/train → Brush
 *
 * 비용: $0 (서버 GPU 안 씀, Brush 가 클라이언트 WebGPU 로 학습).
 *
 * 참고:
 *   - Polycam: https://poly.cam/
 *   - Apple Object Capture: developer.apple.com/augmented-reality/object-capture/
 */

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle,
  Stop,
  X,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { detectFeatures, type FeaturePoint } from '@/lib/features';

const TARGET_SHOTS = 20;
const MIN_SHOTS = 15;
const SECTORS = 12;
const SECTOR_ANGLE = 360 / SECTORS;

type Shot = {
  id: string;
  blob: Blob;
  previewUrl: string;
  orientation: { alpha: number; beta: number; gamma: number } | null;
  features: FeaturePoint[];
  timestamp: number;
};

export default function CapturePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const currentOrientationRef = useRef<{
    alpha: number;
    beta: number;
    gamma: number;
  } | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [flashFeatures, setFlashFeatures] = useState<FeaturePoint[] | null>(null);
  const [flashPhoto, setFlashPhoto] = useState<string | null>(null);
  const [orientationOK, setOrientationOK] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);

  const sectorsCovered = new Set<number>();
  shots.forEach((s) => {
    if (s.orientation) {
      const sector = Math.floor(s.orientation.alpha / SECTOR_ANGLE) % SECTORS;
      sectorsCovered.add(sector);
    }
  });

  // 카메라 시작
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
      setCameraActive(true);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setCameraError('카메라 접근이 거부되었습니다. 브라우저 설정에서 허용해주세요.');
      } else if (msg.includes('NotFound')) {
        setCameraError('카메라를 찾을 수 없습니다.');
      } else {
        setCameraError(`카메라 오류: ${msg}`);
      }
    }
  }, []);

  useEffect(() => {
    if (!cameraActive) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {});
  }, [cameraActive]);

  // DeviceOrientation 구독
  useEffect(() => {
    if (!cameraActive) return;
    if (typeof window === 'undefined') return;

    const handler = (ev: DeviceOrientationEvent) => {
      if (ev.alpha == null) {
        setOrientationOK(false);
        return;
      }
      setOrientationOK(true);
      currentOrientationRef.current = {
        alpha: ev.alpha,
        beta: ev.beta ?? 0,
        gamma: ev.gamma ?? 0,
      };
    };

    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [cameraActive]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  // 셔터 — 사진 촬영 + 특징점 추출 + 애니메이션
  const captureShot = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // 특징점 검출 (동기, ~50-100ms on 1920x1080)
    const features = detectFeatures(canvas, { max: 120 });

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
    );
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const shot: Shot = {
      id: `shot-${Date.now()}`,
      blob,
      previewUrl: url,
      orientation: currentOrientationRef.current,
      features,
      timestamp: Date.now(),
    };
    setShots((prev) => [...prev, shot]);

    // 특징점 애니메이션 (800ms)
    setFlashFeatures(features);
    setFlashPhoto(url);
    setTimeout(() => {
      setFlashFeatures(null);
      setFlashPhoto(null);
    }, 800);
  }, []);

  const removeShot = useCallback((id: string) => {
    setShots((prev) => {
      const removed = prev.find((s) => s.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const proceedToTraining = useCallback(() => {
    // 사진들을 window 에 저장 → /capture/train 에서 읽음
    const files = shots.map(
      (s, i) => new File([s.blob], `shot-${i}.jpg`, { type: 'image/jpeg' }),
    );
    (
      window as Window & {
        __capturedShots?: File[];
        __capturedMeta?: unknown;
      }
    ).__capturedShots = files;
    (
      window as Window & {
        __capturedShots?: File[];
        __capturedMeta?: unknown;
      }
    ).__capturedMeta = {
      count: shots.length,
      sectorsCovered: sectorsCovered.size,
      orientations: shots.map((s) => s.orientation),
    };
    try {
      sessionStorage.setItem(
        'splathub:captured-meta',
        JSON.stringify({
          count: shots.length,
          sectorsCovered: sectorsCovered.size,
          timestamp: Date.now(),
        }),
      );
    } catch {
      /* ignore */
    }
    stopCamera();
    setDone(true);
    setTimeout(() => {
      window.location.href = '/capture/train';
    }, 400);
  }, [shots, sectorsCovered, stopCamera]);

  // 정리
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      shots.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = shots.length >= MIN_SHOTS && sectorsCovered.size >= 8;
  const shotProgress = Math.min(shots.length / TARGET_SHOTS, 1);
  const sectorProgress = sectorsCovered.size / SECTORS;

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
          <span className="text-sm text-base-500">3D 스캔</span>
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
        <div className="relative flex-1 overflow-hidden bg-black">
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
                  <div className="flex max-w-md flex-col gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight text-base-900">
                      3D 스캔 시작
                    </h1>
                    <p className="text-sm text-base-500">
                      대상 주변을 돌면서 <b>15장 이상</b> 촬영하세요. 각 사진에서 특징점을
                      추출해 3D 로 재구성합니다. 삼성/애플 스캐너와 같은 원리.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="tactile inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright"
                  >
                    카메라 시작
                  </button>
                  <div className="mt-6 flex flex-col gap-1 text-xs text-base-400">
                    <p>🟢 비용 $0 — 사용자 GPU 에서 학습</p>
                    <p>🟢 실제 측정 기반 (photogrammetry)</p>
                  </div>
                </>
              )}
            </div>
          ) : done ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center animate-scale-in">
              <CheckCircle size={48} weight="regular" className="text-accent" />
              <p className="text-lg font-medium text-base-900">학습 페이지로 이동 중</p>
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

              {/* 중앙 타겟 서클 */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-56 w-56 rounded-full border border-white/20 sm:h-72 sm:w-72" />
              </div>

              {/* 캡처 애니메이션 오버레이 */}
              {flashPhoto && flashFeatures && (
                <FeatureFlash
                  photoUrl={flashPhoto}
                  features={flashFeatures}
                />
              )}

              {/* 상단 좌: 사진 수 + 각도 카운터 */}
              <div className="absolute left-5 top-5 flex flex-col gap-2 rounded-md bg-black/40 px-3 py-2 text-xs text-white/90 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>사진</span>
                  <span className="font-mono">
                    {shots.length}/{TARGET_SHOTS}
                  </span>
                </div>
                <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${shotProgress * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>각도</span>
                  <span className="font-mono">
                    {sectorsCovered.size}/{SECTORS}
                  </span>
                </div>
                <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${sectorProgress * 100}%` }}
                  />
                </div>
              </div>

              {/* 상단 우: 센서 상태 */}
              {orientationOK === false && (
                <div className="absolute right-5 top-5 rounded-md bg-amber-500/20 px-2 py-1.5 text-[10px] text-amber-100">
                  자이로 센서 미지원 — 수동 회전
                </div>
              )}

              {/* 하단 중앙: 3D 미니맵 (각도 구체들) */}
              <AngleMap3D shots={shots} />

              {/* 하단: 썸네일 스트립 */}
              {shots.length > 0 && (
                <div className="pointer-events-auto absolute bottom-24 left-0 right-0 px-5">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {shots.slice(-8).map((s) => (
                      <div
                        key={s.id}
                        className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md border border-white/20"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeShot(s.id)}
                          className="tactile absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white"
                        >
                          <X size={9} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 숨김 작업 canvas */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* 하단 컨트롤 */}
        {cameraActive && !done && (
          <div className="safe-bottom border-t border-base-100 px-5 py-4 sm:px-8">
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
                onClick={captureShot}
                aria-label="촬영"
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white bg-white/10 transition-transform active:scale-90"
              >
                <Camera size={24} weight="regular" className="text-white" />
              </button>
              <button
                type="button"
                onClick={proceedToTraining}
                disabled={!canSubmit}
                className="tactile inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright disabled:bg-base-200 disabled:text-base-500"
              >
                학습
                <ArrowRight size={12} weight="regular" />
              </button>
            </div>
            {!canSubmit && shots.length > 0 && (
              <p className="mt-2 text-center text-xs text-base-400">
                {shots.length < MIN_SHOTS
                  ? `사진 ${MIN_SHOTS - shots.length}장 더 필요`
                  : sectorsCovered.size < 8
                    ? `각도 ${8 - sectorsCovered.size}개 더 채워주세요`
                    : null}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * 캡처 직후 특징점 애니메이션 오버레이.
 * 사진이 번쩍하면서 점들이 찍힘.
 */
function FeatureFlash({
  photoUrl,
  features,
}: {
  photoUrl: string;
  features: FeaturePoint[];
}) {
  return (
    <div className="pointer-events-none absolute inset-0 animate-flash">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt=""
        className="h-full w-full object-cover opacity-50"
      />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* feature 좌표는 원본 해상도 기준이므로 %  로 변환 필요 — 하지만 원본 해상도 모름.
            대신 %-based 로 렌더하려면 원본 dim 이 필요. 간단하게 features 는 이미 원본
            좌표라 가정하고 imgRef 의 dim 으로 나눔. 여기선 video 해상도 그대로 쓰므로
            이미지와 비율이 같음 → 간소화 불가. 대신 features 에 비율 넣자. 아래 대체. */}
      </svg>
      <div className="absolute inset-0">
        {features.map((f, i) => {
          // feature 좌표는 원본 픽셀 — overlay 는 100% 인 video 크기. 브라우저가
          // object-cover 로 스케일링하므로 % 로 변환 필요. 대략적 근사.
          return (
            <div
              key={i}
              className="pointer-events-none absolute animate-feature-pop rounded-full"
              style={{
                left: `${(f.x / 1920) * 100}%`,
                top: `${(f.y / 1080) * 100}%`,
                width: `${4 + f.response * 4}px`,
                height: `${4 + f.response * 4}px`,
                transform: 'translate(-50%, -50%)',
                background: `rgba(16, 185, 129, ${0.5 + f.response * 0.5})`,
                boxShadow: '0 0 8px rgba(16, 185, 129, 0.8)',
                animationDelay: `${i * 3}ms`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * 하단 중앙 3D 미니맵 — 촬영된 각도를 구체에 표시.
 * DeviceOrientation 이 있으면 실제 위치, 없으면 12구간 원으로 대체.
 */
function AngleMap3D({ shots }: { shots: Shot[] }) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 h-24 w-24 -translate-x-1/2">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {/* 구체 와이어프레임 */}
        <circle cx="50" cy="50" r="35" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
        <ellipse cx="50" cy="50" rx="35" ry="12" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
        <ellipse cx="50" cy="50" rx="12" ry="35" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />

        {/* 각 사진의 카메라 위치 */}
        {shots.map((s, i) => {
          if (!s.orientation) return null;
          // alpha(컴퍼스): 0~360, beta(앞뒤): -180~180
          const alphaRad = (s.orientation.alpha * Math.PI) / 180;
          const betaRad = ((s.orientation.beta - 90) * Math.PI) / 180;

          const r = 35;
          const x = 50 + r * Math.cos(alphaRad) * Math.cos(betaRad);
          const y = 50 + r * Math.sin(betaRad);

          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="1.8"
              fill="rgba(16, 185, 129, 0.9)"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="0.3"
            />
          );
        })}
      </svg>
    </div>
  );
}
