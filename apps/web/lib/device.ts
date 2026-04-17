/**
 * 저사양 기기 감지 유틸. 뷰어의 LOD·pixelRatio·SH degree를 자동 조절하는 데 사용.
 */

export type DeviceProfile = 'high' | 'mid' | 'low';

/**
 * 사용 가능한 힌트를 종합해 디바이스 등급을 추정한다.
 * 정확하지 않아도 됨 — 실패 시 뷰어가 fallback 렌더링으로 degrade.
 */
export function detectDeviceProfile(): DeviceProfile {
  if (typeof navigator === 'undefined') return 'mid';

  const cpu = navigator.hardwareConcurrency ?? 4;
  // deviceMemory는 Chromium 계열에서만 노출
  const memory =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;

  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /iphone|ipad|ipod|android|mobile/.test(ua);
  const isOldIOS = /os (?:14|13|12)_/.test(ua); // WebGL만, WebGPU 없음

  if (cpu >= 8 && memory >= 8 && !isMobile) return 'high';
  if (cpu <= 4 || memory <= 2 || isOldIOS) return 'low';
  return 'mid';
}

export function devicePixelRatioCap(profile: DeviceProfile): number {
  switch (profile) {
    case 'high':
      return Math.min(window.devicePixelRatio ?? 1, 2);
    case 'mid':
      return Math.min(window.devicePixelRatio ?? 1, 1.5);
    case 'low':
      return 1;
  }
}

export function maxGaussiansForProfile(profile: DeviceProfile): number {
  switch (profile) {
    case 'high':
      return 4_000_000;
    case 'mid':
      return 1_500_000;
    case 'low':
      return 600_000;
  }
}
