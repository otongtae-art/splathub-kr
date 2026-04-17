import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 뷰어·캡처 화면은 어두운 배경이 기본. 브랜드 컬러는 v1 미정, 회색 톤으로 출발.
        ink: {
          50: '#f5f5f5',
          100: '#e7e7e7',
          200: '#c4c4c4',
          300: '#9a9a9a',
          400: '#707070',
          500: '#4a4a4a',
          600: '#2e2e2e',
          700: '#1f1f1f',
          800: '#151515',
          900: '#0a0a0a',
        },
        accent: {
          400: '#4fd1c5',
          500: '#2dd4bf',
          600: '#14b8a6',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          'Helvetica Neue',
          'Segoe UI',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'Malgun Gothic',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
