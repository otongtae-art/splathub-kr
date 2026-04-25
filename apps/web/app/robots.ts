import type { MetadataRoute } from 'next';

const BASE = 'https://splathub.vercel.app';

/**
 * Next.js 자동 robots.txt 생성.
 *
 * 검색엔진 크롤링 정책 + sitemap 위치 안내.
 */

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/edit/',
          '/_next/',
          '/_logs/',
        ],
      },
      // 한국 검색엔진 명시 허용
      { userAgent: 'Yeti', allow: '/' }, // Naver
      { userAgent: 'Daumoa', allow: '/' }, // Daum
      { userAgent: 'Googlebot', allow: '/' },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
