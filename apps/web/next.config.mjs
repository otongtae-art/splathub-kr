import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // workspace root를 apps/web으로 명시 → 다중 lockfile 경고 제거
  outputFileTracingRoot: __dirname,
  // transformers.js 의 ONNX weight 바이너리(수백 MB)가 서버리스 함수 트레이싱에
  // 포함돼서 Vercel 250MB 제한을 넘김. 클라이언트 전용이므로 트레이싱에서 제외.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@huggingface/transformers/**',
      'node_modules/onnxruntime-node/**',
      'node_modules/onnxruntime-web/**',
      'node_modules/sharp/**',
      'node_modules/@xenova/**',
      'node_modules/@sparkjsdev/**',
      'node_modules/three/**',
    ],
  },
  // Skills 디렉토리는 앱 소스가 아니므로 webpack watch에서 제외
  // (500+ 파일이 HMR watcher를 느리게 만드는 것을 방지)
  // Spark.js는 Three.js side-effect + WebGL shader를 번들에 포함한다.
  transpilePackages: ['@sparkjsdev/spark', 'three'],
  // transformers.js는 클라이언트 전용. 서버 번들에서 제외해서 250MB Vercel 제한 회피.
  serverExternalPackages: [
    'onnxruntime-node',
    '@huggingface/transformers',
    'sharp',
  ],
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.agents/**', '**/.next/**', '**/.git/**'],
      };
    }
    // 클라이언트 번들에서 node-only 모듈 제외
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: false,
        crypto: false,
        'onnxruntime-node': false,
      };
    }
    // 서버 번들에서 transformers.js 전체 제외 (클라이언트 전용)
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push({
          '@huggingface/transformers': 'commonjs @huggingface/transformers',
          'onnxruntime-node': 'commonjs onnxruntime-node',
          'onnxruntime-web': 'commonjs onnxruntime-web',
        });
      }
    }
    return config;
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
