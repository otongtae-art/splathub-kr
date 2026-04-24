'use client';

/**
 * `/capture` — Polycam/애플 Object Capture 스타일 사진 기반 3D 캡처.
 *
 * 핵심 개선 (2026-04): 객체 바운딩 박스 (target area) 도입.
 *   - 박스 바깥은 어둡게 마스크 처리 → 사용자가 "객체 영역" 시각적으로 인지
 *   - 박스 안 특징점만 검출/저장 → 배경 노이즈 제거
 *   - 캡처 시 사진을 박스 + 20% 패딩으로 크롭 → Brush 가 배경 없이 학습
 *   - 슬라이더로 박스 크기 조절 (작은 물체 / 큰 물체)
 *
 * 흐름:
 *   1. 카메라 시작
 *   2. 중앙 정사각 박스로 객체를 프레이밍 (슬라이더로 크기 조절)
 *   3. 셔터 → 박스 영역 크롭 → 특징점 검출 (박스 내부만) → 애니메이션
 *   4. 3D 미니맵에 각도 추가
 *   5. 15+장 + 8구간 → 학습 → /capture/train → Brush
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
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { saveCaptures } from '@/lib/captureStore';
import { detectFeatures, type FeaturePoint } from '@/lib/features';

// UX 기준 상향 (2026-04-21 리서치 기반):
//   - Polycam 최소 20장, Apple Object Capture 20-30장
//   - 학술 논문: 9-12° 각도 간격 = 최적, 24°+ 는 실패 구간
//   - 기존 30° 간격(12섹터) 은 실패 구간이었음 → 10° 간격(36섹터) 으로 변경
const TARGET_SHOTS = 30;
const MIN_SHOTS = 20;
const SECTORS = 36;
const SECTOR_ANGLE = 360 / SECTORS;
// 학습 조건 — 자이로 있으면 최소 18섹터(180°) 커버, 없으면 사진 수만
const MIN_SECTORS_WITH_GYRO = 18;
// 캡처 시 박스 + 이만큼 패딩 비율 (1.2 = 20% 여유)
const CROP_PADDING_RATIO = 1.2;

type Shot = {
  id: string;
  blob: Blob;
  previewUrl: string;
  orientation: { alpha: number; beta: number; gamma: number } | null;
  features: FeaturePoint[];
  timestamp: number;
};

export default function CapturePage() {
  const router = useRouter();
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
  // 타겟 박스 크기 비율. 0.3 = 작은 물체, 0.85 = 큰 물체. 기본 40%.
  const [boxRatio, setBoxRatio] = useState(0.4);

  // 자이로 기반 각도 커버
  const sectorsCovered = new Set<number>();
  shots.forEach((s) => {
    if (s.orientation) {
      const sector = Math.floor(s.orientation.alpha / SECTOR_ANGLE) % SECTORS;
      sectorsCovered.add(sector);
    }
  });
  // 자이로가 없는 환경 (데스크톱 웹캠 등) 에서는 각 사진을 "수동 각도"
  // 로 간주해 사진 수만으로 학습 조건 충족 가능하게 함.
  const hasGyro = orientationOK === true;

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

  /**
   * 셔터: 전체 프레임 저장 + 박스 영역 특징점 검출.
   *
   * 중요: 이미지는 **크롭하지 않음**. VGGT photogrammetry 는 배경/맥락을
   * 사용해 카메라 위치를 추정하므로 전체 프레임 필요. 박스는 사용자가
   * 객체를 프레이밍하는 가이드일 뿐 크롭하지 않음.
   */
  const captureShot = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // 전체 프레임을 canvas 에 그림 (크롭 X)
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // 특징점은 박스 영역에서 검출 (시각 피드백용)
    // — 저장되는 이미지는 전체 프레임, 검출만 박스 영역
    const shortSide = Math.min(vw, vh);
    const boxSize = shortSide * boxRatio;
    const cropSize = Math.min(shortSide, boxSize * CROP_PADDING_RATIO);
    const cropX = (vw - cropSize) / 2;
    const cropY = (vh - cropSize) / 2;

    // feature 검출용 임시 canvas
    const featureCanvas = document.createElement('canvas');
    featureCanvas.width = cropSize;
    featureCanvas.height = cropSize;
    const fctx = featureCanvas.getContext('2d');
    if (fctx) {
      fctx.drawImage(
        video,
        cropX,
        cropY,
        cropSize,
        cropSize,
        0,
        0,
        cropSize,
        cropSize,
      );
    }
    const features = fctx ? detectFeatures(featureCanvas, { max: 120 }) : [];

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

    // 애니메이션용으로 박스 기준 좌표를 화면 좌표로 변환
    // (feature 는 cropSize 기준 좌표, 화면에서는 박스 + 패딩 영역에 표시)
    setFlashFeatures(features);
    setFlashPhoto(url);
    setTimeout(() => {
      setFlashFeatures(null);
      setFlashPhoto(null);
    }, 800);
  }, [boxRatio]);

  const removeShot = useCallback((id: string) => {
    setShots((prev) => {
      const removed = prev.find((s) => s.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const proceedToTraining = useCallback(async () => {
    const files = shots.map(
      (s, i) => new File([s.blob], `shot-${i}.jpg`, { type: 'image/jpeg' }),
    );

    stopCamera();
    setDone(true);

    try {
      // IndexedDB 에 File[] + 메타 저장 — 새로고침해도 살아남음
      const sessionId = await saveCaptures(files, {
        sectorsCovered: sectorsCovered.size,
        orientations: shots.map((s) => s.orientation),
      });
      console.info(`[capture] saved session ${sessionId} (${files.length} files)`);
    } catch (err) {
      console.error('[capture] saveCaptures failed:', err);
      // IndexedDB 실패 시 window 로 fallback
      (
        window as Window & { __capturedShots?: File[] }
      ).__capturedShots = files;
    }

    // Next.js client-side navigation — window 상태 보존
    router.push('/capture/train');
  }, [shots, sectorsCovered, stopCamera, router]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      shots.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 학습 버튼 활성 조건:
  //   - 자이로 있음: 사진 20장 + 각도 18구간(180° 커버, 10° 간격)
  //   - 자이로 없음: 사진 20장만 (데스크톱 웹캠, 수동 회전)
  const canSubmit = hasGyro
    ? shots.length >= MIN_SHOTS && sectorsCovered.size >= MIN_SECTORS_WITH_GYRO
    : shots.length >= MIN_SHOTS;
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
                      <b>물체를 들지도, 돌리지도 마세요.</b> 카메라를 들고 물체 주변을
                      천천히 한 바퀴 걸으면서 <b>20장 이상</b> 촬영하세요.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="tactile inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright"
                  >
                    카메라 시작
                  </button>

                  {/* 올바른 촬영 vs 잘못된 촬영 시각적 비교 */}
                  <div className="mt-4 grid max-w-md grid-cols-2 gap-3 text-left text-xs">
                    <div className="rounded-md border border-accent/30 bg-accent/[0.04] p-3">
                      <p className="mb-1 font-medium text-accent">✓ 올바른 방법</p>
                      <p className="text-base-600 leading-relaxed">
                        물체를 탁자에 두고
                        <b> 내가 주변을 걷는다</b>.
                        매 걸음마다 촬영.
                      </p>
                    </div>
                    <div className="rounded-md border border-danger/40 bg-danger/[0.04] p-3">
                      <p className="mb-1 font-medium text-danger">✗ 잘못된 방법</p>
                      <p className="text-base-600 leading-relaxed">
                        제자리에 서서
                        <b> 물체를 돌린다</b>.
                        결과가 평면으로 나옴.
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 max-w-md rounded-md border border-amber-500/30 bg-amber-500/[0.04] p-3 text-left text-[11px] text-base-500">
                    <b className="text-amber-700 dark:text-amber-400">왜 이게 중요한가:</b>
                    {' '}photogrammetry (삼성/애플과 같은 방식) 는 카메라가 공간에서
                    <b> 실제로 이동한 거리</b> 를 삼각측량해 3D 를 계산합니다. 물체만
                    돌리면 카메라가 정지한 걸로 인식 → 평면 레이어만 생성.
                  </div>

                  <div className="mt-1 flex flex-col gap-1 text-xs text-base-400">
                    <p>🟢 비용 $0 · Meta VGGT + Poisson mesh</p>
                    <p>🟢 실측 기반 (AI 환각 없음)</p>
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

              {/* 타겟 바운딩 박스 + 바깥 어두운 마스크 */}
              <TargetBoxMask boxRatio={boxRatio} />

              {/* 캡처 플래시 애니메이션 (박스 영역에만) */}
              {flashPhoto && flashFeatures && (
                <FeatureFlash
                  photoUrl={flashPhoto}
                  features={flashFeatures}
                  boxRatio={boxRatio}
                />
              )}

              {/* 상단 좌: 진행률 */}
              <div className="absolute left-5 top-5 flex flex-col gap-2 rounded-md bg-black/50 px-3 py-2 text-xs text-white/90 backdrop-blur-sm">
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
                {hasGyro && (
                  <>
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
                  </>
                )}
              </div>

              {orientationOK === false && (
                <div className="absolute right-5 top-5 rounded-md bg-amber-500/20 px-3 py-1.5 text-[10px] text-amber-100">
                  💻 PC 모드 — 카메라/대상을 직접 움직여 각도 바꿔주세요
                </div>
              )}

              {/* 3D 미니맵 */}
              <AngleMap3D shots={shots} />

              {/* 썸네일 스트립 */}
              {shots.length > 0 && (
                <div className="pointer-events-auto absolute bottom-28 left-0 right-0 px-5">
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

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* 하단 컨트롤 영역 */}
        {cameraActive && !done && (
          <div className="safe-bottom border-t border-base-100 bg-base-0 px-5 py-4 sm:px-8">
            {/* 박스 크기 슬라이더 */}
            <div className="mx-auto mb-3 flex max-w-md items-center gap-3">
              <span className="text-[10px] text-base-500">작게</span>
              <input
                type="range"
                min="0.25"
                max="0.85"
                step="0.05"
                value={boxRatio}
                onChange={(e) => setBoxRatio(parseFloat(e.target.value))}
                className="flex-1 accent-accent"
                aria-label="타겟 박스 크기"
              />
              <span className="text-[10px] text-base-500">크게</span>
              <span className="w-10 font-mono text-[10px] text-base-400">
                박스 {Math.round(boxRatio * 100)}%
              </span>
            </div>
            <p className="mx-auto mb-3 max-w-md text-center text-[11px] text-base-400">
              박스가 <b>객체로 꽉 차게</b> 맞춰주세요 (배경이 적을수록 품질 좋음)
            </p>

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
              <div className="mt-2 flex flex-col items-center gap-1">
                <p className="text-center text-xs text-base-400">
                  {shots.length < MIN_SHOTS
                    ? `사진 ${MIN_SHOTS - shots.length}장 더 필요 (${shots.length}/${MIN_SHOTS})`
                    : hasGyro && sectorsCovered.size < MIN_SECTORS_WITH_GYRO
                      ? `각도 ${MIN_SECTORS_WITH_GYRO - sectorsCovered.size}개 더 (${sectorsCovered.size}/${MIN_SECTORS_WITH_GYRO})`
                      : null}
                </p>
                {/* 카메라 이동 경고: 섹터 커버 vs 사진 수 비율 낮으면 rotate suspect */}
                {hasGyro &&
                  shots.length >= 5 &&
                  sectorsCovered.size / shots.length < 0.3 && (
                    <p className="text-center text-[11px] text-danger">
                      ⚠️ 카메라가 충분히 이동 중이 아닙니다 — 물체 주변을 직접 걸어주세요
                    </p>
                  )}
              </div>
            )}
            {canSubmit && (
              <p className="mt-2 text-center text-xs text-accent">
                ✓ 학습 가능 · {shots.length}장, {hasGyro ? `${sectorsCovered.size}/${SECTORS} 각도` : 'PC 모드'}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * 타겟 바운딩 박스 + 바깥을 어둡게 덮는 마스크.
 * SVG 로 구현해서 화면 크기와 관계없이 깔끔하게 렌더.
 */
function TargetBoxMask({ boxRatio }: { boxRatio: number }) {
  // viewBox 100x100, 중앙에 boxRatio * 60 (세로 기준 적용) 크기 정사각
  // 세로 기준으로 박스 크기 정함 — 가로는 자동으로 맞춰짐
  const boxSize = boxRatio * 70; // 60% 기본 크기, 70으로 스케일
  const half = boxSize / 2;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* 바깥 어두운 마스크 — 박스 영역은 제외 (evenodd 로 구멍) */}
      <path
        d={`M 0 0 L 100 0 L 100 100 L 0 100 Z M ${50 - half} ${50 - half} L ${50 + half} ${50 - half} L ${50 + half} ${50 + half} L ${50 - half} ${50 + half} Z`}
        fill="rgba(0, 0, 0, 0.55)"
        fillRule="evenodd"
      />
      {/* 박스 테두리 */}
      <rect
        x={50 - half}
        y={50 - half}
        width={boxSize}
        height={boxSize}
        fill="none"
        stroke="rgba(16, 185, 129, 0.9)"
        strokeWidth="0.4"
      />
      {/* 4 코너 마커 (L 자 모양) */}
      {[
        [50 - half, 50 - half, 1, 1], // top-left
        [50 + half, 50 - half, -1, 1], // top-right
        [50 - half, 50 + half, 1, -1], // bottom-left
        [50 + half, 50 + half, -1, -1], // bottom-right
      ].map(([x, y, dx, dy], i) => {
        const cornerLen = 3;
        return (
          <g key={i}>
            <line
              x1={x}
              y1={y}
              x2={x! + dx! * cornerLen}
              y2={y}
              stroke="rgba(16, 185, 129, 1)"
              strokeWidth="0.8"
            />
            <line
              x1={x}
              y1={y}
              x2={x}
              y2={y! + dy! * cornerLen}
              stroke="rgba(16, 185, 129, 1)"
              strokeWidth="0.8"
            />
          </g>
        );
      })}
      {/* 중앙 타겟 마커 */}
      <line
        x1="50"
        y1={48}
        x2="50"
        y2={52}
        stroke="rgba(16, 185, 129, 0.6)"
        strokeWidth="0.3"
      />
      <line
        x1={48}
        y1="50"
        x2={52}
        y2="50"
        stroke="rgba(16, 185, 129, 0.6)"
        strokeWidth="0.3"
      />
    </svg>
  );
}

/**
 * 캡처 직후 특징점 애니메이션 — 박스 영역에만 표시.
 */
function FeatureFlash({
  photoUrl,
  features,
  boxRatio,
}: {
  photoUrl: string;
  features: FeaturePoint[];
  boxRatio: number;
}) {
  // features 좌표는 크롭된 이미지 (cropSize x cropSize) 기준.
  // cropSize = shortSide * boxRatio * 1.2 (CROP_PADDING_RATIO)
  // 화면 상에서 cropped 영역은 박스 + 패딩 = boxRatio * 1.2 크기
  const displaySize = boxRatio * CROP_PADDING_RATIO * 70; // viewBox 단위
  const displayHalf = displaySize / 2;

  return (
    <div className="pointer-events-none absolute inset-0 animate-flash">
      <div
        className="absolute"
        style={{
          left: `${50 - displayHalf}%`,
          top: `${50 - displayHalf}%`,
          width: `${displaySize}%`,
          height: `${displaySize}%`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt=""
          className="h-full w-full object-cover opacity-50"
        />
        {/* feature 좌표는 cropSize 기준 (0..cropSize) → 0..100% 로 */}
        {features.map((f, i) => {
          // features.ts 에서 detectFeatures 는 원본 해상도 좌표 반환.
          // 여기서 canvas 는 cropSize x cropSize 이므로 f.x/y 는 0..cropSize.
          // 화면상 % 는 각 좌표 / cropSize.
          // cropSize 를 모르므로 canvas.width 와 같다고 가정 (f 는 그 기준).
          // 대신 f.x, f.y 의 최대값을 cropSize 로 근사.
          // 깔끔하게: feature 의 x/y 를 max 로 나눠서 0..1 로 정규화.
          const maxX = Math.max(...features.map((p) => p.x), 1);
          const maxY = Math.max(...features.map((p) => p.y), 1);
          return (
            <div
              key={i}
              className="pointer-events-none absolute animate-feature-pop rounded-full"
              style={{
                left: `${(f.x / maxX) * 100}%`,
                top: `${(f.y / maxY) * 100}%`,
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
 * 3D 미니맵 (하단 중앙) — 촬영된 각도를 구체에 표시.
 */
function AngleMap3D({ shots }: { shots: Shot[] }) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 h-24 w-24 -translate-x-1/2">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <circle
          cx="50"
          cy="50"
          r="35"
          fill="rgba(0,0,0,0.3)"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="0.5"
        />
        <ellipse
          cx="50"
          cy="50"
          rx="35"
          ry="12"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="0.5"
        />
        <ellipse
          cx="50"
          cy="50"
          rx="12"
          ry="35"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="0.5"
        />

        {shots.map((s, i) => {
          if (!s.orientation) return null;
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
