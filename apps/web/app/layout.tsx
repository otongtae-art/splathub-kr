import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SplatHub — 카메라로 한번 찍어서 3D',
    template: '%s · SplatHub',
  },
  description:
    '웹캠·카메라로 바로 3D Gaussian Splat을 만들어 공유하는 무료 한국어 커뮤니티. 사진 3장이면 충분합니다.',
  applicationName: 'SplatHub',
  keywords: [
    'Gaussian Splatting',
    '3D 스캔',
    'photo to 3D',
    '사진 3D 변환',
    '.ply 뷰어',
    'splat',
    'WebGPU',
  ],
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: 'SplatHub',
    title: 'SplatHub — 카메라로 한번 찍어서 3D',
    description: '사진 몇 장으로 만드는 3D Gaussian Splat.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SplatHub',
    description: '카메라로 한번 찍어서 3D.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
