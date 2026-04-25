import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

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
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'SplatHub — 사진으로 진짜 3D',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SplatHub — 사진으로 진짜 3D',
    description: '물체 주변을 걸으며 20장 촬영. photogrammetry 기반. 무료.',
    creator: '@austinoh',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  // 검색엔진 사이트 인증 — 추후 토큰 받으면 채움.
  // Google Search Console: https://search.google.com/search-console
  // Naver Search Advisor: https://searchadvisor.naver.com/
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
    other: {
      'naver-site-verification': process.env.NEXT_PUBLIC_NAVER_VERIFICATION || '',
    },
  },
  category: 'technology',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1011',
};

/**
 * JSON-LD 구조화 데이터 — Google rich snippets, Naver Knowledge Graph 노출.
 * schema.org 표준 — Google·Naver·Bing·Daum 모두 지원.
 *
 * 포함 타입:
 *   - WebSite (사이트 메타)
 *   - Person (작성자, 검색 키워드 포함)
 *   - Organization (조직)
 *   - SoftwareApplication (제품)
 *   - FAQPage (Google FAQ rich snippet)
 *   - BreadcrumbList (검색 결과 panel breadcrumb)
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'SplatHub',
      alternateName: ['SplatHub-KR', '스플랫허브', '사진 3D 변환'],
      description:
        '사진 몇 장으로 photogrammetry 기반 3D 모델을 만드는 한국어 무료 서비스.',
      inLanguage: 'ko-KR',
      author: { '@id': `${SITE_URL}/#creator` },
      publisher: { '@id': `${SITE_URL}/#org` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/explore?q={query}`,
        'query-input': 'required name=query',
      },
    },
    {
      '@type': 'Person',
      '@id': `${SITE_URL}/#creator`,
      name: CREATOR.name,
      alternateName: CREATOR.alternateNames,
      url: SITE_URL,
      jobTitle: 'Founder',
      worksFor: { '@id': `${SITE_URL}/#org` },
      knowsAbout: ['3D Reconstruction', 'Photogrammetry', 'Web Development', 'AI'],
      sameAs: [
        'https://github.com/otongtae-art',
      ],
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: CREATOR.organization,
      legalName: 'WishMaker Group',
      alternateName: ['WishMaker', 'WishMaker Group', 'wishmakergroup', '위시메이커', '위시메이커그룹', '위시메이커 그룹'],
      url: SITE_URL,
      founder: { '@id': `${SITE_URL}/#creator` },
      foundingDate: '2026',
      slogan: '사진 몇 장으로 진짜 3D',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#app`,
      name: 'SplatHub',
      applicationCategory: 'PhotographyApplication',
      operatingSystem: 'Web browser (Chrome 134+ for WebGPU)',
      url: SITE_URL,
      description:
        'Meta VGGT photogrammetry, Microsoft TRELLIS.2 generative 3D, Brush WebGPU 학습 통합 한국어 무료 서비스.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
      author: { '@id': `${SITE_URL}/#creator` },
      featureList: [
        'photogrammetry 기반 3D 재구성',
        'AI generative 3D (TRELLIS.2)',
        '브라우저 WebGPU 학습 (Brush)',
        '한국어 UI · 무료 · 회원가입 불필요',
      ],
      inLanguage: 'ko-KR',
      browserRequirements: 'Modern browser with WebGPU (Chrome/Edge 134+)',
    },
    // FAQ rich snippet — 구글 검색 결과에 Q&A 카드로 노출
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'SplatHub 는 무엇인가요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '사진 몇 장으로 3D 모델을 만드는 한국어 무료 웹 서비스입니다. 물체 주변을 걸으며 20장 촬영하면 Meta VGGT (CVPR 2025 Best Paper) photogrammetry 가 실측 기반 3D 를 자동 재구성합니다.',
          },
        },
        {
          '@type': 'Question',
          name: '비용이 드나요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '완전 무료입니다. 회원가입도 필요 없습니다. Hugging Face ZeroGPU 무료 티어를 사용해 GPU 비용을 0원으로 유지합니다.',
          },
        },
        {
          '@type': 'Question',
          name: 'AI 생성 3D 와 photogrammetry 의 차이는?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'AI 생성 (TRELLIS, Hunyuan3D 등) 은 1장 사진에서 3D 를 상상해서 만듭니다 — 빠르지만 환각 가능. Photogrammetry (Meta VGGT, gsplat) 는 여러 장 사진의 다른 각도를 비교해 실제 3D 를 측정합니다 — 정확하지만 사진 여러 장 필요. SplatHub 는 두 방식 모두 제공합니다.',
          },
        },
        {
          '@type': 'Question',
          name: '제작자는 누구인가요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'WishMaker Group (위시메이커그룹) 의 오용택 (Austin Oh / austinoh / yongtaekoh / wishmaker) 이 제작했습니다.',
          },
        },
        {
          '@type': 'Question',
          name: '결과를 어떻게 사용할 수 있나요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '생성된 .glb / .ply 파일을 다운로드해 Blender, Unity, Unreal, Three.js 등에서 사용 가능합니다. 무료 라이선스는 CC-BY-NC 기본.',
          },
        },
      ],
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'SplatHub', item: SITE_URL },
        {
          '@type': 'ListItem',
          position: 2,
          name: '3D 스캔 시작',
          item: `${SITE_URL}/capture`,
        },
      ],
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
      <body>
        {/* round 52: Service Worker 자동 등록 (production only) */}
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
