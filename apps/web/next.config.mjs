import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // workspace root를 apps/web으로 명시 → 다중 lockfile 경고 제거
  outputFileTracingRoot: __dirname,
  // Skills 디렉토리는 앱 소스가 아니므로 webpack watch에서 제외
  // (500+ 파일이 HMR watcher를 느리게 만드는 것을 방지)
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.agents/**', '**/.next/**', '**/.git/**'],
      };
    }
    return config;
  },
  // Spark.js는 Three.js side-effect + WebGL shader를 번들에 포함한다. Cloudflare Pages
  // Edge runtime은 WebGL/Canvas 접근 불가 → 뷰어 페이지는 반드시 클라이언트 렌더링.
  transpilePackages: ['@sparkjsdev/spark', 'three'],
  serverExternalPackages: [],
  // R2 / HF Dataset 원격 이미지 썸네일 허용
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: 'huggingface.co' },
      { protocol: 'https', hostname: 'cdn-lfs.huggingface.co' },
    ],
  },
  // WebGPU / WASM 워커용 헤더 (Brush 폴백에 필요한 cross-origin isolation은 /convert/local에만 적용)
  async headers() {
    return [
      {
        source: '/convert/local/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

export default nextConfig;
