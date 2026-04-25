import { ImageResponse } from 'next/og';

/**
 * Apple touch icon — iOS Safari 홈화면 추가 시 사용 (180x180 PNG).
 * Next.js 가 빌드 시 자동 생성 + <link rel="apple-touch-icon"> 등록.
 *
 * 디자인은 favicon (icon.svg) 과 일관 — Emerald 다중 카메라 점.
 */

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default async function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0e1011',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* 궤도 원 */}
        <div
          style={{
            position: 'absolute',
            width: 110,
            height: 110,
            border: '1.5px dashed rgba(16,185,129,0.35)',
            borderRadius: '50%',
            display: 'flex',
          }}
        />
        {/* 중앙 대상 객체 */}
        <div
          style={{
            width: 36,
            height: 36,
            background: '#10b981',
            borderRadius: '50%',
            display: 'flex',
            boxShadow: '0 0 24px rgba(16,185,129,0.55)',
          }}
        />
        {/* 카메라 위치 1 (위, 가장 진함) */}
        <div
          style={{
            position: 'absolute',
            top: 30,
            width: 18,
            height: 18,
            background: '#10b981',
            opacity: 0.9,
            borderRadius: '50%',
            display: 'flex',
          }}
        />
        {/* 카메라 위치 2 (오른쪽 아래) */}
        <div
          style={{
            position: 'absolute',
            bottom: 38,
            right: 30,
            width: 18,
            height: 18,
            background: '#10b981',
            opacity: 0.7,
            borderRadius: '50%',
            display: 'flex',
          }}
        />
        {/* 카메라 위치 3 (왼쪽 아래, 가장 흐림) */}
        <div
          style={{
            position: 'absolute',
            bottom: 38,
            left: 30,
            width: 18,
            height: 18,
            background: '#10b981',
            opacity: 0.5,
            borderRadius: '50%',
            display: 'flex',
          }}
        />
      </div>
    ),
    {
      ...size,
    },
  );
}
