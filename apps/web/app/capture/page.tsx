'use client';

/**
 * `/capture` — 동영상 기반 photogrammetry 캡처.
 *
 * 왜 동영상인가:
 *   삼성 3D Scanner / 애플 Object Capture 도 내부적으로 영상 프레임을 사용.
 *   사진 1장으로 TRELLIS 가 상상하는 방식보다, 실제 여러 각도에서 측정한
 *   프레임들로 Brush (photogrammetry) 학습이 근본적으로 품질이 높음.
 *
 * 흐름:
 *   1. 카메라 시작
 *   2. 대상 주변을 천천히 한 바퀴 돌면서 15~20초 녹화
 *      - DeviceOrientation API 로 각도 추적 (12구간 원형 가이드)
 *      - MediaRecorder 로 WebM 저장
 *   3. 녹화 완료 → /capture/train 페이지로 이동
 *      - Brush WebGPU 에 동영상 드롭해서 학습
 *
 * 비용: $0 (사용자 카메라 + 사용자 GPU).
 */

import {
  ArrowLeft,
  CheckCircle,
  Record,
  Stop,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

// 삼성 방식: 한 바퀴 = 12구간. 각 구간이 30° 커버.
const SECTORS = 12;
const SECTOR_ANGLE = 360 / SECTORS;

// 권장 녹화 길이 (초). 짧으면 Brush 학습 품질 낮음, 길면 파일 커짐.
const MIN_DURATION_SEC = 12;
const TARGET_DURATION_SEC = 18;
const MAX_DURATION_SEC = 30;

type RecordingState = 'idle' | 'recording' | 'done' | 'error';

export default function CapturePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recState, setRecState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [sectorsCovered, setSectorsCovered] = useState<Set<number>>(new Set());
  const [orientationOK, setOrientationOK] = useState<boolean | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
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

  // stream → video 바인딩
  useEffect(() => {
    if (!cameraActive) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      /* autoplay 정책 관대하게 처리 */
    });
  }, [cameraActive]);

  // DeviceOrientation: 스마트폰 자이로 → 각도 추적
  useEffect(() => {
    if (!cameraActive) return;
    if (typeof window === 'undefined') return;

    const handler = (ev: DeviceOrientationEvent) => {
      const alpha = ev.alpha; // 0~360 컴퍼스 방향
      if (alpha == null) {
        setOrientationOK(false);
        return;
      }
      setOrientationOK(true);
      if (recState !== 'recording') return;
      // 현재 각도가 속한 섹터 계산
      const sector = Math.floor(alpha / SECTOR_ANGLE) % SECTORS;
      setSectorsCovered((prev) => {
        if (prev.has(sector)) return prev;
        const next = new Set(prev);
        next.add(sector);
        return next;
      });
    };

    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [cameraActive, recState]);

  const stopCamera = useCallback(() => {
    recorderRef.current?.state === 'recording' && recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setRecState('idle');
  }, []);

  // MediaRecorder 녹화 시작
  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    // Brush 가 선호하는 포맷 우선. WebM VP9 > WebM VP8 > MP4.
    const mimeCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) {
      setCameraError('브라우저가 동영상 녹화를 지원하지 않습니다.');
      return;
    }

    chunksRef.current = [];
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 6_000_000, // 6Mbps — Brush 가 처리 가능한 품질
    });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      // sessionStorage 에 저장해 /capture/train 에서 읽음
      // Blob 은 sessionStorage 에 직접 저장 불가 → URL + 메타만 저장
      try {
        sessionStorage.setItem(
          'splathub:captured-video',
          JSON.stringify({
            url,
            mime,
            size: blob.size,
            duration: elapsed,
            sectors: sectorsCovered.size,
            timestamp: Date.now(),
          }),
        );
      } catch {
        /* sessionStorage 초과 대비 */
      }
      // Blob 은 window 에 임시 노출 (/capture/train 에서 URL 로 fetch)
      (window as Window & { __capturedVideoBlob?: Blob }).__capturedVideoBlob = blob;
      setRecState('done');
    };
    rec.start(100); // 100ms 마다 chunk
    recorderRef.current = rec;
    setRecState('recording');
    setElapsed(0);
    setSectorsCovered(new Set());
  }, [elapsed, sectorsCovered]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'recording') return;
    rec.stop();
  }, []);

  // 녹화 경과 타이머
  useEffect(() => {
    if (recState !== 'recording') return;
    const start = Date.now();
    const interval = setInterval(() => {
      const sec = (Date.now() - start) / 1000;
      setElapsed(sec);
      // 최대 길이 도달 시 자동 중단
      if (sec >= MAX_DURATION_SEC) {
        recorderRef.current?.stop();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [recState]);

  // 페이지 이탈 시 정리
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const proceedToTraining = useCallback(() => {
    stopCamera();
    window.location.href = '/capture/train';
  }, [stopCamera]);

  // 진행률
  const progress = Math.min(elapsed / TARGET_DURATION_SEC, 1);
  const canStop = elapsed >= MIN_DURATION_SEC;
  const sectorProgress = sectorsCovered.size / SECTORS;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* 상단 바 */}
      <nav className="flex items-center justify-between border-b border-base-100 px-5 py-3.5 sm:px-8">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-base-900"
          >
            SplatHub
          </Link>
          <span className="text-sm text-base-500">동영상 3D 캡처</span>
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
        {/* 카메라 화면 */}
        <div className="relative flex-1 bg-black">
          {!cameraActive && recState !== 'done' ? (
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
                  <Record size={40} weight="fill" className="text-accent" />
                  <div className="flex max-w-md flex-col gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight text-base-900">
                      동영상으로 실제 3D 만들기
                    </h1>
                    <p className="text-sm text-base-500">
                      대상을 중앙에 놓고 <b>15~20초간 천천히 한 바퀴</b> 돌면서
                      녹화하세요. 삼성/애플 3D 스캐너와 같은 방식이며 결과 품질이
                      사진 1장보다 훨씬 정확합니다.
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
                    <p>🟢 비용 $0 — 사용자 기기 GPU 로 학습</p>
                    <p>🟢 환각 없음 — 실제 측정 기반 (photogrammetry)</p>
                  </div>
                </>
              )}
            </div>
          ) : recState === 'done' ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center animate-scale-in">
              <CheckCircle size={48} weight="regular" className="text-accent" />
              <div className="flex flex-col gap-1.5">
                <h2 className="text-2xl font-semibold tracking-tight text-base-900">
                  녹화 완료
                </h2>
                <p className="text-sm text-base-500">
                  {elapsed.toFixed(1)}초 · 각도 {sectorsCovered.size}/{SECTORS}구간
                </p>
              </div>
              <button
                type="button"
                onClick={proceedToTraining}
                className="tactile inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright"
              >
                3D 학습 시작 →
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecState('idle');
                  setElapsed(0);
                  setSectorsCovered(new Set());
                  startCamera();
                }}
                className="text-xs text-base-500 transition-colors hover:text-base-800"
              >
                다시 녹화하기
              </button>
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

              {/* 12구간 각도 가이드 (원형 인디케이터) */}
              <SectorIndicator covered={sectorsCovered} />

              {/* 좌상단: 경과 시간 + 녹화 상태 */}
              <div className="absolute left-5 top-5 flex flex-col gap-1 font-mono text-xs text-white/90">
                {recState === 'recording' && (
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                    <span>{elapsed.toFixed(1)}s</span>
                  </div>
                )}
                <span>각도 {sectorsCovered.size}/{SECTORS}</span>
              </div>

              {/* 우상단: DeviceOrientation 상태 */}
              {orientationOK === false && (
                <div className="absolute right-5 top-5 flex max-w-[200px] items-start gap-1.5 rounded-md bg-amber-500/20 px-2 py-1.5 text-[10px] text-amber-100">
                  <Warning size={12} weight="regular" />
                  <span>자이로 센서 미지원 — 수동 회전해주세요</span>
                </div>
              )}

              {/* 중앙 하단: 진행률 바 */}
              {recState === 'recording' && (
                <div className="absolute bottom-4 left-1/2 w-64 -translate-x-1/2 rounded-full bg-white/10 backdrop-blur-sm">
                  <div
                    className="h-1.5 rounded-full bg-accent transition-all"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* 하단 컨트롤 */}
        {cameraActive && recState !== 'done' && (
          <div className="safe-bottom border-t border-base-100 px-5 py-4 sm:px-8">
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={stopCamera}
                className="tactile inline-flex items-center gap-1.5 rounded-md border border-base-200 bg-base-50 px-3 py-2 text-sm text-base-700"
              >
                <Stop size={13} weight="regular" />
                취소
              </button>
              {recState === 'idle' ? (
                <button
                  type="button"
                  onClick={startRecording}
                  aria-label="녹화 시작"
                  className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-500 bg-red-500/20 transition-transform active:scale-90"
                >
                  <Record size={24} weight="fill" className="text-red-500" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  disabled={!canStop}
                  aria-label="녹화 중단"
                  className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-500 bg-red-500 transition-transform active:scale-90 disabled:opacity-50"
                >
                  <Stop size={20} weight="fill" className="text-white" />
                </button>
              )}
              <div className="w-[76px]" />
            </div>
            {recState === 'recording' && !canStop && (
              <p className="mt-2 text-center text-xs text-base-400">
                최소 {MIN_DURATION_SEC}초 필요 · 남은 시간 {(MIN_DURATION_SEC - elapsed).toFixed(0)}초
              </p>
            )}
            {recState === 'recording' && canStop && sectorProgress < 0.75 && (
              <p className="mt-2 text-center text-xs text-amber-600">
                각도 더 채워주세요 ({sectorsCovered.size}/{SECTORS})
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * 12구간 각도 원형 인디케이터 — 사용자가 어느 각도를 찍었는지 시각화.
 */
function SectorIndicator({ covered }: { covered: Set<number> }) {
  return (
    <div className="pointer-events-none absolute bottom-24 left-1/2 h-32 w-32 -translate-x-1/2">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {Array.from({ length: SECTORS }).map((_, i) => {
          const isCovered = covered.has(i);
          const startAngle = (i * SECTOR_ANGLE - 90) * (Math.PI / 180);
          const endAngle = ((i + 1) * SECTOR_ANGLE - 90) * (Math.PI / 180);
          const largeArc = SECTOR_ANGLE > 180 ? 1 : 0;

          const r = 40;
          const cx = 50;
          const cy = 50;
          const x1 = cx + r * Math.cos(startAngle);
          const y1 = cy + r * Math.sin(startAngle);
          const x2 = cx + r * Math.cos(endAngle);
          const y2 = cy + r * Math.sin(endAngle);

          const pathData = [
            `M ${cx} ${cy}`,
            `L ${x1} ${y1}`,
            `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
            'Z',
          ].join(' ');

          return (
            <path
              key={i}
              d={pathData}
              fill={isCovered ? 'rgba(16, 185, 129, 0.55)' : 'rgba(255,255,255,0.05)'}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="0.5"
            />
          );
        })}
      </svg>
    </div>
  );
}
