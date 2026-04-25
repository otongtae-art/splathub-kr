import { ImageResponse } from 'next/og';

/**
 * 동적 OG 이미지 — Next.js 가 빌드 시 1200x630 PNG 생성.
 * 카카오톡/트위터/페이스북 등 링크 미리보기에 사용.
 *
 * 디자인 원칙: OLED 검정 배경, Emerald 액센트, 미니멀 타이포그래피.
 */

export const runtime = 'edge';
export const alt = 'SplatHub — 사진으로 3D 만들기';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0e1011',
          display: 'flex',
          flexDirection: 'column',
          padding: '80px',
          position: 'relative',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        }}
      >
        {/* 배경 그라데이션 점 (subtle) */}
        <div
          style={{
            position: 'absolute',
            top: '-200px',
            right: '-100px',
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0) 70%)',
            display: 'flex',
          }}
        />

        {/* 상단 brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '12px',
          }}
        >
          <div
            style={{
              fontSize: '36px',
              fontWeight: 600,
              color: '#fafafa',
              letterSpacing: '-0.02em',
            }}
          >
            SplatHub
          </div>
          <div
            style={{
              fontSize: '14px',
              color: '#7a7d80',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            beta
          </div>
        </div>

        {/* 가운데 메인 메시지 */}
        <div
          style={{
            marginTop: 'auto',
            marginBottom: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          <div
            style={{
              fontSize: '88px',
              fontWeight: 700,
              color: '#fafafa',
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              maxWidth: '900px',
            }}
          >
            사진 몇 장으로
            <br />
            <span style={{ color: '#10b981' }}>진짜 3D</span> 만들기
          </div>
          <div
            style={{
              fontSize: '28px',
              color: '#a8aaad',
              maxWidth: '800px',
              lineHeight: 1.4,
            }}
          >
            물체 주변을 걸으며 20장 촬영하면 끝. AI 환각 없는
            photogrammetry 기반 3D 재구성.
          </div>
        </div>

        {/* 하단 정보 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '32px',
            borderTop: '1px solid #2a2d30',
            color: '#7a7d80',
            fontSize: '20px',
          }}
        >
          <div style={{ display: 'flex', gap: '24px' }}>
            <span>Meta VGGT</span>
            <span style={{ color: '#3a3d40' }}>·</span>
            <span>TRELLIS.2</span>
            <span style={{ color: '#3a3d40' }}>·</span>
            <span>Brush WebGPU</span>
          </div>
          <div style={{ color: '#10b981' }}>splathub.vercel.app</div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
