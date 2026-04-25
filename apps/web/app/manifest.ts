import type { MetadataRoute } from 'next';

/**
 * PWA Web App Manifest — round 38.
 *
 * "홈 화면에 추가" 가능 + standalone 디스플레이 모드로 풀스크린 capture
 * 경험 제공. 모바일 사용자 (capture 주 채널) 가 SplatHub 를 native app 처럼
 * 사용 가능.
 *
 * Next.js 14+ 가 자동으로 /manifest.webmanifest 라우트로 노출 + <link>
 * 태그 head 에 주입.
 */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SplatHub — 사진으로 진짜 3D',
    short_name: 'SplatHub',
    description:
      '물체 주변을 걸으며 20장 촬영하면 photogrammetry 로 3D 재구성. AI 환각 없는 실측 기반.',
    start_url: '/capture',
    display: 'standalone', // 풀스크린 (브라우저 chrome 숨김) — capture 시 카메라 영역 최대화
    orientation: 'portrait',
    background_color: '#0e1011',
    theme_color: '#0e1011',
    lang: 'ko',
    dir: 'ltr',
    categories: ['photo', 'graphics', 'productivity'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/favicon.ico',
        sizes: '16x16 32x32 48x48',
        type: 'image/x-icon',
      },
      // apple-icon.tsx (180x180 PNG, edge runtime) — iOS 가 우선 사용
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    // 단축 액션 (Android 길게 누르기 메뉴)
    shortcuts: [
      {
        name: '촬영 시작',
        short_name: '촬영',
        description: '카메라로 객체 주변 사진 20장 촬영',
        url: '/capture',
        icons: [{ src: '/icon.svg', sizes: 'any' }],
      },
      {
        name: '예시 모델',
        short_name: '예시',
        description: '샘플 3D 결과 미리보기',
        url: '/m/sample-butterfly',
        icons: [{ src: '/icon.svg', sizes: 'any' }],
      },
    ],
  };
}
