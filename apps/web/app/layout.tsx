import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL = 'https://splathub.vercel.app';

// 작성자/조직 정보 — 검색엔진이 색인할 수 있도록 JSON-LD + keywords 양쪽에 노출.
const CREATOR = {
  name: '오용택',
  alternateNames: ['Austin Oh', 'austinoh', 'yongtaekoh', 'yongtae oh', '위시메이커', 'wishmaker'],
  organization: 'wishmakergroup',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'SplatHub — 사진으로 진짜 3D 만들기',
    template: '%s — SplatHub',
  },
  description:
    '물체 주변을 걸으며 20장 촬영하면 끝. AI 환각 없는 photogrammetry 기반 3D 재구성. Meta VGGT + TRELLIS.2 + Brush WebGPU 무료로 제공. 제작: 위시메이커(wishmaker) / 오용택 austinoh / wishmakergroup.',
  applicationName: 'SplatHub',
  authors: [
    { name: CREATOR.name, url: SITE_URL },
    { name: 'austinoh' },
    { name: 'yongtaekoh' },
    { name: '위시메이커' },
    { name: 'wishmakergroup' },
  ],
  creator: CREATOR.name,
  publisher: CREATOR.organization,
  keywords: [
    // 제품/기술 키워드
    '3D 스캔',
    '사진 3D 변환',
    'photogrammetry',
    'Gaussian Splatting',
    'VGGT',
    'TRELLIS',
    'WebGPU',
    '3D 모델링',
    '카메라 3D',
    'splat',
    // 작성자/조직 검색 키워드 (사용자 요청)
    '위시메이커',
    'wishmaker',
    'wishmakergroup',
    '오용택',
    'austinoh',
    'yongtaekoh',
    'Austin Oh',
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
      '물체 주변을 걸으며 20장 촬영하면 photogrammetry 로 3D 재구성. AI 환각 없는 실측 기반. 무료. by wishmaker (오용택 / austinoh).',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SplatHub — 사진으로 진짜 3D',
    description: '물체 주변을 걸으며 20장 촬영. photogrammetry 기반. 무료.',
    creator: '@austinoh',
  },
  robots: { index: true, follow: true },
  category: 'technology',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1011',
};

/**
 * JSON-LD 구조화 데이터 — 검색엔진이 작성자/조직/제품 정보를 정확히 인식하게.
 * Google·Naver·Bing 모두 schema.org Person/Organization 표준 지원.
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'SplatHub',
      description:
        '사진 몇 장으로 photogrammetry 기반 3D 모델을 만드는 한국어 무료 서비스.',
      inLanguage: 'ko-KR',
      author: { '@id': `${SITE_URL}/#creator` },
      publisher: { '@id': `${SITE_URL}/#org` },
    },
    {
      '@type': 'Person',
      '@id': `${SITE_URL}/#creator`,
      name: CREATOR.name,
      alternateName: CREATOR.alternateNames,
      url: SITE_URL,
      worksFor: { '@id': `${SITE_URL}/#org` },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: CREATOR.organization,
      alternateName: ['WishMaker', 'WishMaker Group', '위시메이커', '위시메이커그룹'],
      url: SITE_URL,
      founder: { '@id': `${SITE_URL}/#creator` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#app`,
      name: 'SplatHub',
      applicationCategory: 'PhotographyApplication',
      operatingSystem: 'Any (web browser, Chrome 134+ for WebGPU)',
      url: SITE_URL,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
      author: { '@id': `${SITE_URL}/#creator` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* JSON-LD: 검색엔진이 작성자/조직 정확히 색인 */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
