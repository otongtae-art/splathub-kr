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
