'use client';

/**
 * 햅틱 피드백 — 셔터 발사 등 즉각 반응 필요한 순간에 사용.
 *
 * 지원 현황:
 * - Android Chrome / Firefox: ✓ (실제 진동)
 * - Desktop Chrome: 무시 (silently)
 * - iOS Safari: 미지원 (Apple 정책, silently 무시)
 *
 * try-catch 로 모든 환경에서 안전하게 호출 가능 — 실패 시 silent.
 */

export function shutterHaptic(durationMs: number = 30): void {
  try {
    // navigator.vibrate 가 없는 브라우저 (iOS Safari) 는 typeof check 로 회피
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(durationMs);
    }
  } catch {
    // 권한 / autoplay 정책 등 모든 에러 무시
  }
}

/**
 * 짧은 더블 탭 — 경고 / 흐림 알림 등에 사용 (셔터와 구분).
 */
export function warningHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([20, 50, 20]);
    }
  } catch {
    /* silent */
  }
}

/* ─── 셔터 사운드 (round 22) ─── */
// iOS Safari 는 Vibration API 미지원 → 셔터 발사 인지 불가.
// Web Audio API 로 짧은 'tick' 사운드 → 모든 브라우저 동작 (iOS 포함).
// 단, AudioContext 는 user gesture 안에서 만들어야 함.

let audioCtx: AudioContext | null = null;
let audioEnabled = false;

/**
 * 사용자 토글 ON 시 호출 — user gesture 안에서 AudioContext 생성.
 * 이후 playShutterSound() 가 작동.
 */
export function enableShutterSound(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor =
      window.AudioContext ??
      (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return false;
    if (!audioCtx) audioCtx = new Ctor();
    // iOS 는 user gesture 안에서 resume 호출해야 unlock
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
    audioEnabled = true;
    return true;
  } catch {
    return false;
  }
}

export function disableShutterSound(): void {
  audioEnabled = false;
}

/**
 * 셔터 사운드 재생 — 짧은 tick (1500Hz, ~50ms exp decay).
 * audioEnabled=false 이거나 AudioContext suspended 면 silent.
 */
export function playShutterSound(): void {
  if (!audioEnabled || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') {
      // 다시 unlock 시도 (iOS 가 백그라운드 후 suspend 할 수 있음)
      void audioCtx.resume();
      return; // 이번엔 skip, 다음 셔터부터 재생
    }
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 1500; // 'click' 같은 고음
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.05);
  } catch {
    /* silent */
  }
}
