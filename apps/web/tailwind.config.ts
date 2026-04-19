import type { Config } from 'tailwindcss';

/**
 * SplatHub design system — taste-skill 원칙 기반
 *
 * - Pure OLED 배경 (#0e1011) — 진정한 깊이감
 * - 단일 accent (Emerald, saturation < 80%) — Lila Ban 준수
 * - 고정 타입 스케일 (UI용) + tracking-tighter
 * - Geist sans/mono (Pretendard Fallback for ko-KR)
 * - 그라데이션/glow 금지
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Pure OLED 기반 — taste-skill의 Dark Premium OLED 원칙
        base: {
          0: '#0e1011', // 순수 OLED 배경
          50: '#141618',
          100: '#1a1d1f',
          200: '#24282b',
          300: '#363b3f',
          400: '#4a5056',
          500: '#6a7076',
          600: '#8b9197',
          700: '#b2b7bc',
          800: '#d4d7da',
          900: '#eceeef',
        },
        // 단일 accent — Emerald 계열 (saturation 75%)
        accent: {
          DEFAULT: '#10b981',
          subtle: '#064e3b',
          bright: '#34d399',
        },
        // 세만틱
        danger: '#e5484d',
        warn: '#f59e0b',
        success: '#10b981',
      },
      fontFamily: {
        // 순수 시스템 폰트 스택 — 한국어는 Apple SD Gothic Neo / Malgun Gothic.
        // taste-skill의 Geist 선호 규칙은 프로덕션에서 CDN 폰트 추가 시 대체 가능.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Segoe UI',
          'Apple SD Gothic Neo',
          'Pretendard Variable',
          'Pretendard',
          'Noto Sans KR',
          'Malgun Gothic',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SF Mono',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      fontSize: {
        // 고정 타입 스케일 (UI용, fluid 금지)
        xs: ['11px', { lineHeight: '16px', letterSpacing: '-0.01em' }],
        sm: ['13px', { lineHeight: '20px', letterSpacing: '-0.01em' }],
        base: ['15px', { lineHeight: '24px', letterSpacing: '-0.01em' }],
        lg: ['17px', { lineHeight: '26px', letterSpacing: '-0.015em' }],
        xl: ['20px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
        '2xl': ['24px', { lineHeight: '32px', letterSpacing: '-0.025em' }],
        '3xl': ['30px', { lineHeight: '38px', letterSpacing: '-0.03em' }],
        '4xl': ['40px', { lineHeight: '46px', letterSpacing: '-0.035em' }],
        '5xl': ['56px', { lineHeight: '60px', letterSpacing: '-0.04em' }],
        '6xl': ['72px', { lineHeight: '72px', letterSpacing: '-0.045em' }],
      },
      spacing: {
        // 4pt 그리드 + 중간 값
        18: '4.5rem',
        22: '5.5rem',
      },
      borderRadius: {
        // 보수적인 둥글기 — 과도한 radius 금지
        xs: '4px',
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '12px',
        xl: '16px',
      },
      animation: {
        // 섬세한 모션 (Emil Kowalski + taste-skill)
        'fade-in': 'fadeIn 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 2s linear infinite',
        // capture 페이지 — 셔터 플래시 + 특징점 팝
        flash: 'flash 800ms ease-out forwards',
        'feature-pop': 'featurePop 800ms ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // 셔터 플래시 — 하얀색 → 투명
        flash: {
          '0%': { opacity: '1' },
          '60%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        // 특징점 팝 — 작게 시작해 커지면서 페이드
        featurePop: {
          '0%': { opacity: '0', transform: 'translate(-50%, -50%) scale(0.3)' },
          '30%': { opacity: '1', transform: 'translate(-50%, -50%) scale(1.3)' },
          '60%': { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
          '100%': { opacity: '0', transform: 'translate(-50%, -50%) scale(0.8)' },
        },
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
