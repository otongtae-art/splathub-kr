/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Spark.js는 Three.js side-effect + WebGL shader를 번들에 포함한다. Cloudflare Pages
  // Edge runtime은 WebGL/Canvas 접근 불가 → 뷰어 페이지는 반드시 클라이언트 렌더링.
  transpilePackages: ['@splathub/shared', '@sparkjsdev/spark', 'three'],
  experimental: {
    // 대용량 .spz/.ply 응답 스트리밍을 위해 future-proof
    serverComponentsExternalPackages: [],
  },
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
