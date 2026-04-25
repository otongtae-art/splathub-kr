import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL = 'https://splathub.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'SplatHub — 사진으로 진짜 3D 만들기',
    template: '%s — SplatHub',
  },
  description:
    '물체 주변을 걸으며 20장 촬영하면 끝. AI 환각 없는 photogrammetry 기반 3D 재구성. Meta VGGT + TRELLIS.2 + Brush WebGPU 무료로 제공.',
  applicationName: 'SplatHub',
  authors: [{ name: 'SplatHub' }],
  keywords: [
    '3D 스캔',
    '사진 3D 변환',
    'photogrammetry',
    'Gaussian Splatting',
    'VGGT',
    'TRELLIS',
    'WebGPU',
    '3D 모델링',
    '카메라 3D',
  ],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: 'SplatHub',
    title: 'SplatHub — 사진으로 진짜 3D 만들기',
    description:
      '물체 주변을 걸으며 20장 촬영하면 photogrammetry 로 3D 재구성. AI 환각 없는 실측 기반. 무료.',
    // app/opengraph-image.tsx 가 자동으로 1200x630 PNG 생성해 등록함
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SplatHub — 사진으로 진짜 3D',
    description: '물체 주변을 걸으며 20장 촬영. photogrammetry 기반. 무료.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1011',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
