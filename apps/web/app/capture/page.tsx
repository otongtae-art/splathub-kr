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
import { shutterHaptic, warningHaptic } from '@/lib/haptics';
import {
  classifyBlurry,
  computeBrightness,
  computeSharpness,
} from '@/lib/sharpness';

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
  /** 직전 촬영 이후 누적 이동량 추정치 (작으면 카메라 정지). */
  motionSinceLast: number;
  features: FeaturePoint[];
  /** Laplacian variance — 클수록 선명. 모든 shot 의 median 대비로 흐림 판정. */
  sharpness: number;
  /** 평균 luma (0-255). 낮으면 어두운 환경 → ISO noise 증가 (round 11). */
  brightness: number;
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
  // Translation 감지: 가속도 integration 으로 누적 이동 거리 추정.
  // 완벽하진 않지만 "정지 vs 이동" 판별엔 충분.
  const motionAccumRef = useRef<number>(0);
  const lastMotionTickRef = useRef<number>(0);
  // 최근 가속도 EWMA (round 10) — auto-capture motion gate 용
  // 큰 값 = 카메라가 움직이는 중 (모션 블러 위험), 작은 값 = 정지/안정
  const recentMotionRef = useRef<number>(0);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [flashFeatures, setFlashFeatures] = useState<FeaturePoint[] | null>(null);
  const [flashPhoto, setFlashPhoto] = useState<string | null>(null);
  // 즉시 품질 경고 (round 8 → 11 확장) — 흐림 또는 어두움
  const [blurToast, setBlurToast] = useState<{
    id: string;
    isBlurry: boolean;
    isDark: boolean;
  } | null>(null);
  const [orientationOK, setOrientationOK] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);
  // 타겟 박스 크기 비율. 0.3 = 작은 물체, 0.85 = 큰 물체. 기본 40%.
  const [boxRatio, setBoxRatio] = useState(0.4);
  // 미니맵용 live alpha — orientation ref 를 5Hz 폴링해서 state 동기화
  // (60Hz event 마다 setState 하면 전체 렌더 폭주 → 200ms throttle)
  const [liveAlpha, setLiveAlpha] = useState<number | null>(null);
  // 자동 촬영 모드 (round 9) — 빈 섹터 진입 시 자동 셔터
  const [autoCapture, setAutoCapture] = useState(false);
  // round 10 — auto-capture 가 motion gate 로 대기 중인지 표시
  const [autoWaiting, setAutoWaiting] = useState(false);
  // round 14 — manual shutter 도 burst 활성화 (opt-in, 250ms 지연 vs 품질)
  const [manualBurst, setManualBurst] = useState(false);
  // round 15+16 — 카메라 시작 직후 환경 사전 체크 (밝기 + feature density)
  const [envCheck, setEnvCheck] = useState<{
    state: 'pending' | 'ready';
    issues: ('dim' | 'low_texture')[];
    avgBrightness: number;
    avgFeatures: number;
  } | null>(null);
  const [envBannerDismissed, setEnvBannerDismissed] = useState(false);
  // round 17 — 환경 OK 시 잠시 (2.5초) "✓" 배지 노출 (silent pass → 명시적 피드백)
  const [envOkVisible, setEnvOkVisible] = useState(false);
  // 자동 모드 상태: 직전 섹터 + 마지막 자동 shot 시각 (debounce)
  const prevSectorRef = useRef<number | null>(null);
  const lastAutoShotAtRef = useRef<number>(0);

  // 자이로 기반 각도 커버
  const sectorsCovered = new Set<number>();
  shots.forEach((s) => {
    if (s.orientation) {
      const sector = Math.floor(s.orientation.alpha / SECTOR_ANGLE) % SECTORS;
      sectorsCovered.add(sector);
    }
  });

  // round 13: 현재 위치에서 가장 가까운 빈 섹터 — 미니맵 'go this way' 타겟.
  // 양방향 (시계 + 반시계) 으로 동시 검색해 더 가까운 쪽 선택.
  let nextSector: number | null = null;
  if (liveAlpha != null && sectorsCovered.size < SECTORS) {
    const cur = Math.floor(liveAlpha / SECTOR_ANGLE) % SECTORS;
    for (let dist = 0; dist <= SECTORS / 2; dist++) {
      const cw = (cur + dist) % SECTORS;
      const ccw = (cur - dist + SECTORS) % SECTORS;
      if (!sectorsCovered.has(cw)) {
        nextSector = cw;
        break;
      }
      if (!sectorsCovered.has(ccw)) {
        nextSector = ccw;
        break;
      }
    }
  }

  // 흐림 판정 — 모든 shot 의 sharpness 분포 기반 (median * 0.4 미만 + abs 30 미만)
  const blurryIds = new Set<string>();
  if (shots.length >= 3) {
    const { blurryIndices } = classifyBlurry(shots.map((s) => s.sharpness));
    blurryIndices.forEach((i) => {
      const s = shots[i];
      if (s) blurryIds.add(s.id);
    });
  }

  // round 21: kept (non-blurry) shot 중 sharpness 최대 — TRELLIS 폴백/메타용
  // 5장 이상일 때만 의미 있게 표시 (소수면 모두 좋은 사진).
  let bestShotId: string | null = null;
  if (shots.length >= 5) {
    let bestScore = -1;
    for (const s of shots) {
      if (blurryIds.has(s.id)) continue; // 흐림 제외
      if (s.sharpness > bestScore) {
        bestScore = s.sharpness;
        bestShotId = s.id;
      }
    }
  }
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

  // 미니맵 "you are here" 인디케이터용 — 5Hz 폴링
  useEffect(() => {
    if (!cameraActive) return;
    const id = window.setInterval(() => {
      setLiveAlpha(currentOrientationRef.current?.alpha ?? null);
    }, 200);
    return () => window.clearInterval(id);
  }, [cameraActive]);

  // round 15+16 — 카메라 시작 직후 환경 사전 체크 (밝기 + feature density)
  // 어두움 (R15) + textureless wall (R16) 동시 검출.
  // textureless = photogrammetry 가 본질적으로 작동 안 함 (feature 매칭 불가).
  useEffect(() => {
    if (!cameraActive) return;
    if (shots.length > 0) return; // 이미 촬영 시작됨
    if (envCheck && envCheck.state !== 'pending') return; // 이미 완료

    setEnvCheck({
      state: 'pending',
      issues: [],
      avgBrightness: 0,
      avgFeatures: 0,
    });
    let cancelled = false;
    const brightSamples: number[] = [];
    const featCounts: number[] = [];

    const sampleOnce = () => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      try {
        brightSamples.push(computeBrightness(video));
        // 작은 해상도 (200px) + max 80 features 로 빠르게 측정
        const feats = detectFeatures(video, { max: 80, width: 200 });
        featCounts.push(feats.length);
      } catch {
        /* ignore */
      }
    };

    // 200ms 간격 5회 샘플 → 1초간 평균
    const interval = window.setInterval(sampleOnce, 200);
    const finish = window.setTimeout(() => {
      window.clearInterval(interval);
      if (cancelled || brightSamples.length === 0) return;
      const avgB =
        brightSamples.reduce((a, b) => a + b, 0) / brightSamples.length;
      const avgF =
        featCounts.length > 0
          ? featCounts.reduce((a, b) => a + b, 0) / featCounts.length
          : 0;
      const issues: ('dim' | 'low_texture')[] = [];
      // 60 미만 = 어두움 (R15 임계값)
      if (avgB < 60) issues.push('dim');
      // 평균 feature 수 < 20 → textureless wall 의심
      // 일반 객체 장면은 200px 다운스케일에서 ~50-80 features 검출
      if (avgF < 20) issues.push('low_texture');
      setEnvCheck({
        state: 'ready',
        issues,
        avgBrightness: avgB,
        avgFeatures: avgF,
      });
    }, 1100);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive, shots.length]);

  // round 17 — 환경 체크 완료 + issues 없을 때 잠깐 ✓ 배지 표시 (2.5초)
  useEffect(() => {
    if (envCheck?.state !== 'ready') return;
    if (envCheck.issues.length > 0) return;
    setEnvOkVisible(true);
    const t = window.setTimeout(() => setEnvOkVisible(false), 2500);
    return () => window.clearTimeout(t);
  }, [envCheck]);

  // DeviceMotion: 가속도 → 누적 이동량 (translation 감지)
  // 진짜 이동 거리는 double integration 이라 오차 크지만
  // "정지 vs 움직임" 판별엔 충분히 robust.
  useEffect(() => {
    if (!cameraActive) return;
    if (typeof window === 'undefined') return;

    const handler = (ev: DeviceMotionEvent) => {
      const acc = ev.accelerationIncludingGravity;
      if (!acc) return;
      const now = Date.now();
      const dt = lastMotionTickRef.current
        ? (now - lastMotionTickRef.current) / 1000
        : 0;
      lastMotionTickRef.current = now;

      // 중력 제거 (대략적). 정지 시 sqrt(x²+y²+z²) ≈ 9.8
      const mag = Math.sqrt(
        (acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2,
      );
      const linear = Math.abs(mag - 9.8);
      // 작은 노이즈 임계값
      if (linear > 0.3 && dt < 0.5) {
        motionAccumRef.current += linear * dt;
      }
      // EWMA — α=0.25, ~3 sample 동안 영향. 약 200ms 윈도우의 평균 효과.
      // auto-capture 가 이 값으로 셔터 안전 시점 판단.
      recentMotionRef.current =
        0.75 * recentMotionRef.current + 0.25 * linear;
    };

    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
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
   *
   * round 12: opts.burst=true 이면 3 프레임을 70ms 간격으로 캡처해
   * 가장 sharp 한 프레임을 채택 (Apple Object Capture 패턴).
   * Auto-capture 에서 활성화 → 250ms 추가 latency 지만 사용자 인지 X.
   */
  const captureShot = useCallback(async (opts: { burst?: boolean } = {}) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // round 14: 셔터 햅틱 (Android Chrome 만 실제 동작, 그 외 silent)
    shutterHaptic(30);

    // 박스 영역 좌표 계산 — feature/sharpness/brightness 측정용
    const shortSide = Math.min(vw, vh);
    const boxSize = shortSide * boxRatio;
    const cropSize = Math.min(shortSide, boxSize * CROP_PADDING_RATIO);
    const cropX = (vw - cropSize) / 2;
    const cropY = (vh - cropSize) / 2;

    // 프레임 캡처 헬퍼 — full-res + thumb 동시에
    const captureOneFrame = (): {
      full: HTMLCanvasElement;
      thumb: HTMLCanvasElement;
    } | null => {
      const full = document.createElement('canvas');
      full.width = vw;
      full.height = vh;
      const fullCtx = full.getContext('2d');
      if (!fullCtx) return null;
      fullCtx.drawImage(video, 0, 0);

      const thumb = document.createElement('canvas');
      thumb.width = cropSize;
      thumb.height = cropSize;
      const thumbCtx = thumb.getContext('2d');
      if (!thumbCtx) return null;
      thumbCtx.drawImage(
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
      return { full, thumb };
    };

    // burst=true → 3 프레임 70ms 간격, 가장 sharp 한 것 채택
    // burst=false → 단일 프레임 (manual shutter, 즉시 응답)
    const FRAME_COUNT = opts.burst ? 3 : 1;
    const FRAME_INTERVAL = 70;
    let bestSharpness = -1;
    let bestFrame: { full: HTMLCanvasElement; thumb: HTMLCanvasElement } | null =
      null;

    for (let i = 0; i < FRAME_COUNT; i++) {
      if (i > 0) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, FRAME_INTERVAL),
        );
      }
      const frame = captureOneFrame();
      if (!frame) continue;
      const s = computeSharpness(frame.thumb);
      if (s > bestSharpness) {
        bestSharpness = s;
        bestFrame = frame;
      }
    }
    if (!bestFrame) return;

    // 채택된 프레임으로 features/brightness/blob 계산
    const features = detectFeatures(bestFrame.thumb, { max: 120 });
    const sharpness = bestSharpness; // 이미 계산됨
    const brightness = computeBrightness(bestFrame.thumb);

    // canvasRef 에 표시는 안 하지만 호환 위해 채택 프레임 복사
    canvas.width = vw;
    canvas.height = vh;
    canvas.getContext('2d')?.drawImage(bestFrame.full, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      bestFrame!.full.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
    );
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const motion = motionAccumRef.current;
    motionAccumRef.current = 0; // 리셋
    const shot: Shot = {
      id: `shot-${Date.now()}`,
      blob,
      previewUrl: url,
      orientation: currentOrientationRef.current,
      motionSinceLast: motion,
      features,
      sharpness,
      brightness,
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

    // 즉시 품질 경고 — 흐림(sharpness<50) 또는 어두움(brightness<35).
    // 어두움 35 = 거의 검정. 일반 실내 200+, 어두운 실내 50-100.
    const isBlurry = sharpness < 50;
    const isDark = brightness < 35;
    if (isBlurry || isDark) {
      setBlurToast({ id: shot.id, isBlurry, isDark });
      // round 14: 흐림/어두움 시 더블 탭 진동 — 셔터(30ms)와 구분
      warningHaptic();
      setTimeout(() => {
        setBlurToast((cur) => (cur?.id === shot.id ? null : cur));
      }, 3500);
    }
  }, [boxRatio]);

  // 자동 촬영 모드 (round 9) — 빈 섹터 진입 시 자동 셔터
  // 조건 (모두 만족):
  //   - autoCapture ON
  //   - 자이로 사용 가능 (PC 모드는 alpha 없음 → 의미 없음)
  //   - 현재 alpha 의 섹터가 직전과 다름 (sector 전환)
  //   - 새 섹터가 아직 안 채워짐
  //   - 마지막 자동 shot 으로부터 800ms 경과 (debounce)
  //   - (round 10) recentMotionRef < 0.4 m/s² (steady — 모션 블러 방지)
  // 시작 시(shots 0개)에는 첫 셔터를 자동 발사.
  useEffect(() => {
    if (!autoCapture || !cameraActive || done) return;
    if (liveAlpha == null) return; // PC 모드 또는 아직 측정 전

    const now = Date.now();
    if (now - lastAutoShotAtRef.current < 800) return;

    const sector = Math.floor(liveAlpha / SECTOR_ANGLE) % SECTORS;
    const prevSector = prevSectorRef.current;
    const sectorChanged = prevSector === null || sector !== prevSector;
    prevSectorRef.current = sector;

    if (!sectorChanged) return;
    if (sectorsCovered.has(sector) && shots.length > 0) return;

    // round 10: 모션 게이트 — 카메라 흔들림 시 셔터 보류 (motion blur 방지)
    // EWMA 가 ~200ms 윈도우 평균. 0.4 m/s² 는 steady 한 손 정도.
    if (recentMotionRef.current > 0.4) {
      // sector 는 channge 된 채로 prev 갱신했으므로 다음 폴링에 motion 안정되면 발사
      // prevSector 를 다시 null 처리해 다음 tick 에 재평가
      prevSectorRef.current = null;
      setAutoWaiting(true);
      return;
    }
    setAutoWaiting(false);

    lastAutoShotAtRef.current = now;
    // round 12: auto-capture 는 burst=true (3프레임 → 가장 sharp 채택).
    // 사용자가 셔터 안 누르므로 250ms 추가 지연 인지 X.
    void captureShot({ burst: true });
  }, [
    autoCapture,
    cameraActive,
    done,
    liveAlpha,
    sectorsCovered,
    shots.length,
    captureShot,
  ]);

  const removeShot = useCallback((id: string) => {
    setShots((prev) => {
      const removed = prev.find((s) => s.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const proceedToTraining = useCallback(async () => {
    // 흐린 사진 자동 제외 — 단, 모두 흐리면 (median 자체가 낮음) 그대로 보냄
    // (어두운 환경 등). 또한 너무 많이 잘리지 않도록 max 30% 만 제거.
    const sharpnessScores = shots.map((s) => s.sharpness);
    const { blurryIndices } = classifyBlurry(sharpnessScores);
    const droppable = new Set(blurryIndices);
    // 30% 한도 — 모자라면 sharpness 낮은 순으로 droppable 줄이기
    const maxDrop = Math.floor(shots.length * 0.3);
    let droppedShots = shots.filter((_, i) => droppable.has(i));
    if (droppedShots.length > maxDrop) {
      // 흐린 정도 가장 심한 것 우선 제거
      droppedShots = [...droppedShots]
        .sort((a, b) => a.sharpness - b.sharpness)
        .slice(0, maxDrop);
    }
    const droppedSet = new Set(droppedShots.map((s) => s.id));
    const kept = shots.filter((s) => !droppedSet.has(s.id));

    const files = kept.map(
      (s, i) => new File([s.blob], `shot-${i}.jpg`, { type: 'image/jpeg' }),
    );
    // round 18: dropped 사진들도 별도 File[] 로 변환 → IndexedDB 에 보관 →
    // train 페이지에서 사용자가 미리보기 가능 (transparency)
    const droppedFiles = droppedShots.map(
      (s, i) => new File([s.blob], `dropped-${i}.jpg`, { type: 'image/jpeg' }),
    );
    if (droppedSet.size > 0) {
      console.info(
        `[capture] dropped ${droppedSet.size} blurry shots before VGGT (kept ${kept.length})`,
      );
    }

    stopCamera();
    setDone(true);

    try {
      // IndexedDB 에 File[] + 메타 + dropped 별도 저장
      const sessionId = await saveCaptures(
        files,
        {
          sectorsCovered: sectorsCovered.size,
          orientations: kept.map((s) => s.orientation),
          droppedBlurry: droppedSet.size,
          // round 20: sharpness 점수 — train 의 TRELLIS 폴백이 best shot 선택용
          sharpnessScores: kept.map((s) => s.sharpness),
        },
        droppedFiles.length > 0 ? droppedFiles : undefined,
      );
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

              {/* round 17: 환경 OK ✓ 배지 (2.5초) — 사용자에게 silent pass 명시 */}
              {envOkVisible && shots.length === 0 && envCheck && (
                <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 animate-fade-in">
                  <div className="flex items-center gap-2 rounded-md border border-accent/40 bg-black/85 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-sm">
                    <span className="text-accent">✓</span>
                    <span>
                      환경 OK · 밝기 {envCheck.avgBrightness.toFixed(0)} ·
                      특징점 {envCheck.avgFeatures.toFixed(0)}
                    </span>
                  </div>
                </div>
              )}

              {/* round 15+16: 환경 사전 체크 banner — dim 또는 low_texture 시 */}
              {envCheck?.state === 'ready' &&
                envCheck.issues.length > 0 &&
                !envBannerDismissed &&
                shots.length === 0 && (
                  <div className="pointer-events-auto absolute left-5 right-5 top-20 mx-auto max-w-md animate-fade-in">
                    <div className="flex items-start gap-2.5 rounded-md border border-amber-500/50 bg-black/85 px-3.5 py-2.5 text-xs text-white shadow-lg backdrop-blur-sm">
                      <span className="mt-0.5 text-amber-400">
                        {envCheck.issues.includes('low_texture') ? '🎨' : '💡'}
                      </span>
                      <div className="flex flex-1 flex-col gap-1">
                        <p className="font-medium text-amber-200">
                          {envCheck.issues.length === 2
                            ? `환경 부적합 — 밝기 ${envCheck.avgBrightness.toFixed(0)}, 특징점 ${envCheck.avgFeatures.toFixed(0)}`
                            : envCheck.issues[0] === 'low_texture'
                              ? `질감 부족 — 평균 특징점 ${envCheck.avgFeatures.toFixed(0)}개`
                              : `환경이 어둡습니다 (밝기 ${envCheck.avgBrightness.toFixed(0)})`}
                        </p>
                        <p className="text-[11px] text-white/70">
                          {envCheck.issues.includes('low_texture') &&
                          envCheck.issues.includes('dim')
                            ? '단색 벽 + 어두운 환경 — photogrammetry 가 카메라 위치를 추정하지 못합니다.'
                            : envCheck.issues[0] === 'low_texture'
                              ? '단색 벽이나 무늬 없는 배경은 photogrammetry 가 카메라 위치를 추정하지 못합니다. 패턴/질감 있는 배경을 권장합니다.'
                              : '어두운 곳에서는 카메라 ISO 노이즈 ↑ → photogrammetry 품질 ↓. 더 밝은 곳에서 촬영을 권장합니다.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEnvBannerDismissed(true)}
                        className="tactile rounded border border-white/20 px-2 py-0.5 text-[10px] text-white/80 hover:bg-white/10"
                      >
                        무시
                      </button>
                    </div>
                  </div>
                )}

              {/* 즉시 품질 경고 toast — 흐림 또는 어두움 시 3.5초 표시 */}
              {blurToast && (
                <div
                  role="alert"
                  className="pointer-events-auto absolute left-1/2 top-20 -translate-x-1/2 animate-fade-in"
                >
                  <div className="flex items-center gap-3 rounded-md border border-danger/60 bg-black/85 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-sm">
                    <span className="text-danger">⚠</span>
                    <span>
                      <b>
                        {blurToast.isBlurry && blurToast.isDark
                          ? '흐림 + 어두움'
                          : blurToast.isBlurry
                            ? '흐림 감지'
                            : '어두움 — 조명 부족'}
                      </b>
                      <span className="ml-1 text-white/70">
                        ·{' '}
                        {blurToast.isDark && !blurToast.isBlurry
                          ? '센서 noise 증가 가능'
                          : '자동 제외 가능성 높음'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        removeShot(blurToast.id);
                        setBlurToast(null);
                      }}
                      className="tactile rounded border border-danger/40 px-2 py-0.5 text-[10px] font-medium text-danger hover:bg-danger/10"
                    >
                      지우기
                    </button>
                  </div>
                </div>
              )}

              {/* 3D 미니맵 — covered/missing 섹터 + 현재 카메라 방향 + 추천 다음 위치 */}
              <AngleMap3D
                shots={shots}
                sectorsCovered={sectorsCovered}
                liveAlpha={hasGyro ? liveAlpha : null}
                nextSector={hasGyro ? nextSector : null}
              />

              {/* 썸네일 스트립 — 흐린 사진은 빨간 테두리 + "흐림" 배지 */}
              {shots.length > 0 && (
                <div className="pointer-events-auto absolute bottom-28 left-0 right-0 px-5">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {shots.slice(-8).map((s) => {
                      const isBlurry = blurryIds.has(s.id);
                      const isBest = s.id === bestShotId;
                      return (
                        <div
                          key={s.id}
                          className={`relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md border ${
                            isBlurry
                              ? 'border-danger'
                              : isBest
                                ? 'border-accent shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                                : 'border-white/20'
                          }`}
                          title={isBest ? `최고 sharp · ${s.sharpness.toFixed(0)}` : undefined}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={s.previewUrl}
                            alt=""
                            className={`h-full w-full object-cover ${
                              isBlurry ? 'opacity-60' : ''
                            }`}
                          />
                          {isBlurry && (
                            <span className="absolute bottom-0 left-0 right-0 bg-danger/90 text-center text-[8px] font-medium leading-tight text-white">
                              흐림
                            </span>
                          )}
                          {isBest && !isBlurry && (
                            <span className="absolute bottom-0 left-0 right-0 bg-accent/90 text-center text-[8px] font-medium leading-tight text-base-0">
                              ★ best
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeShot(s.id)}
                            className="tactile absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white"
                          >
                            <X size={9} weight="bold" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {blurryIds.size > 0 && (
                    <p className="mt-1 text-center text-[10px] text-white/70">
                      흐림 {blurryIds.size}장 — 학습 시 자동 제외 (한도 30%)
                    </p>
                  )}
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
                onClick={() => captureShot({ burst: manualBurst })}
                aria-label="촬영"
                className={`flex h-16 w-16 items-center justify-center rounded-full border-2 bg-white/10 transition-transform active:scale-90 ${
                  autoCapture
                    ? 'border-accent shadow-[0_0_18px_rgba(16,185,129,0.55)] animate-pulse'
                    : 'border-white'
                }`}
              >
                <Camera
                  size={24}
                  weight="regular"
                  className={autoCapture ? 'text-accent' : 'text-white'}
                />
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

            {/* 자동 촬영 토글 (자이로 있을 때만 의미 있음) */}
            {hasGyro && (
              <div className="mx-auto mt-3 flex max-w-md flex-col items-center gap-1">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-base-600">
                  <input
                    type="checkbox"
                    checked={autoCapture}
                    onChange={(e) => {
                      setAutoCapture(e.target.checked);
                      // 토글 시 prev sector 리셋 — 즉시 첫 자동 shot 가능
                      prevSectorRef.current = null;
                      setAutoWaiting(false);
                    }}
                    className="h-3.5 w-3.5 cursor-pointer accent-accent"
                  />
                  <span>
                    🎬 <b>자동 촬영</b> — 빈 섹터 진입 시 3장 burst (sharp 1장 채택)
                  </span>
                </label>
                {autoCapture && autoWaiting && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 animate-pulse">
                    📷 카메라 안정 대기 중 — 잠시 멈춰주세요
                  </p>
                )}
              </div>
            )}

            {/* round 14: manual 셔터 burst 토글 (auto 와 별개, 항상 표시) */}
            {!autoCapture && (
              <div className="mx-auto mt-2 flex max-w-md items-center justify-center">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-base-600">
                  <input
                    type="checkbox"
                    checked={manualBurst}
                    onChange={(e) => setManualBurst(e.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer accent-accent"
                  />
                  <span>
                    ✨ <b>3장 burst</b> — 셔터 1번에 3장 → sharp 1장 (250ms 더 걸림)
                  </span>
                </label>
              </div>
            )}
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
 * 3D 미니맵 (하단 중앙) — 촬영 각도 + 미커버 섹터 + 현재 카메라 방향.
 *
 * 핵심: 미커버 섹터를 빨간 dim 점으로 표시 → 사용자가 어디로 이동해야
 * 빈 구간을 채울지 시각적으로 즉시 인지. (이전엔 "10/36" 숫자만 보여
 * 어느 방향이 빈지 알 수 없어 무작위 회전).
 */
function AngleMap3D({
  shots,
  sectorsCovered,
  liveAlpha,
  nextSector,
}: {
  shots: Shot[];
  sectorsCovered: Set<number>;
  liveAlpha: number | null;
  /** 현재 위치에서 가장 가까운 빈 섹터 — 'go this way' 강조 (round 13) */
  nextSector: number | null;
}) {
  // 36 섹터 = 10° 간격 ring (적도 위에 배치)
  const sectors = Array.from({ length: SECTORS }, (_, i) => i);
  const liveAlphaRad = liveAlpha != null ? (liveAlpha * Math.PI) / 180 : null;

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

        {/* 36 섹터 ring — covered=초록, missing=빨강 dim, next=강조. 적도 평면. */}
        {sectors.map((s) => {
          const covered = sectorsCovered.has(s);
          const isNext = !covered && s === nextSector;
          // 섹터 중심 각도 (sector 0 = 0°, sector 1 = 10°, ...)
          const centerDeg = s * SECTOR_ANGLE + SECTOR_ANGLE / 2;
          const rad = (centerDeg * Math.PI) / 180;
          const r = 32; // 메인 구체 r=35 보다 약간 안쪽
          const x = 50 + r * Math.cos(rad);
          const y = 50 + r * Math.sin(rad) * 0.34; // 적도 ellipse ratio (12/35)
          // 다음 추천 sector → 더 크게 + 풀 빨강 + pulse, 일반 missing 보다 눈에 띔
          return (
            <circle
              key={`sec-${s}`}
              cx={x}
              cy={y}
              r={isNext ? 1.8 : 1.0}
              fill={
                covered
                  ? 'rgba(16, 185, 129, 0.55)'
                  : isNext
                    ? 'rgba(239, 68, 68, 0.95)'
                    : 'rgba(239, 68, 68, 0.42)'
              }
              className={isNext ? 'animate-pulse' : undefined}
            />
          );
        })}

        {/* 실제 촬영 각도 (orientation 그대로 — 적도 위/아래 모두) */}
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

        {/* "you are here" — 현재 카메라 방향 화살표 (적도 외곽) */}
        {liveAlphaRad != null && (
          <>
            <circle
              cx={50 + 38 * Math.cos(liveAlphaRad)}
              cy={50 + 38 * Math.sin(liveAlphaRad) * 0.34}
              r="1.6"
              fill="rgba(255, 255, 255, 0.95)"
              stroke="rgba(16, 185, 129, 1)"
              strokeWidth="0.6"
            />
            {/* 중앙에서 현재 방향으로 짧은 선 */}
            <line
              x1="50"
              y1="50"
              x2={50 + 36 * Math.cos(liveAlphaRad)}
              y2={50 + 36 * Math.sin(liveAlphaRad) * 0.34}
              stroke="rgba(255, 255, 255, 0.4)"
              strokeWidth="0.4"
              strokeDasharray="1 1"
            />
          </>
        )}
      </svg>
    </div>
  );
}
