import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr';

export const metadata = {
  title: '오픈소스 attribution',
  description: 'SplatHub에 사용된 오픈소스 구성요소와 라이선스.',
};

type LicenseItem = {
  name: string;
  license: string;
  url: string;
  purpose: string;
};

const ALLOWED: LicenseItem[] = [
  {
    name: 'SuperSplat',
    license: 'MIT',
    url: 'https://github.com/playcanvas/supersplat',
    purpose: '.ply 에디터 (iframe 임베드)',
  },
  {
    name: 'Spark.js',
    license: 'MIT',
    url: 'https://github.com/sparkjsdev/spark',
    purpose: '.ply/.spz 뷰어 렌더링',
  },
  {
    name: '@playcanvas/splat-transform',
    license: 'MIT',
    url: 'https://www.npmjs.com/package/@playcanvas/splat-transform',
    purpose: 'ply ↔ spz ↔ sog 변환 CLI',
  },
  {
    name: 'VGGT-1B-Commercial',
    license: 'Meta Commercial',
    url: 'https://github.com/facebookresearch/vggt',
    purpose: '카메라 포즈 · 깊이 추정',
  },
  {
    name: 'FreeSplatter',
    license: 'Apache 2.0',
    url: 'https://github.com/TencentARC/FreeSplatter',
    purpose: '피드-포워드 3D Gaussian 생성',
  },
  {
    name: 'gsplat (nerfstudio)',
    license: 'Apache 2.0',
    url: 'https://github.com/nerfstudio-project/gsplat',
    purpose: 'Phase 2 고품질 학습',
  },
  {
    name: 'Brush',
    license: 'Apache 2.0',
    url: 'https://github.com/ArthurBrussee/brush',
    purpose: '클라이언트 WebGPU 학습 폴백',
  },
  {
    name: 'RMBG-1.4',
    license: 'MIT',
    url: 'https://huggingface.co/briaai/RMBG-1.4',
    purpose: '배경 제거 전처리',
  },
  {
    name: 'Phosphor Icons',
    license: 'MIT',
    url: 'https://github.com/phosphor-icons/react',
    purpose: 'UI 아이콘',
  },
  {
    name: 'Next.js',
    license: 'MIT',
    url: 'https://github.com/vercel/next.js',
    purpose: '웹 앱 프레임워크',
  },
  {
    name: 'Tailwind CSS',
    license: 'MIT',
    url: 'https://github.com/tailwindlabs/tailwindcss',
    purpose: '스타일링',
  },
];

const BANNED: LicenseItem[] = [
  {
    name: 'VGGT-1B (기본)',
    license: '비상업 Only',
    url: 'https://github.com/facebookresearch/vggt',
    purpose: '→ VGGT-1B-Commercial로 대체',
  },
  {
    name: 'RMBG-2.0',
    license: '비상업 Only',
    url: 'https://huggingface.co/briaai/RMBG-2.0',
    purpose: '→ RMBG-1.4로 대체',
  },
  {
    name: 'Splatt3R',
    license: 'CC BY-NC',
    url: 'https://github.com/btsmart/splatt3r',
    purpose: '→ FreeSplatter로 대체',
  },
  {
    name: 'graphdeco-inria 3DGS',
    license: '비상업 Only',
    url: 'https://github.com/graphdeco-inria/gaussian-splatting',
    purpose: '→ gsplat(Apache 2.0)으로 대체',
  },
];

export default function LicensesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-10 sm:py-14">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-base-500 transition-colors hover:text-base-800"
      >
        <ArrowLeft size={11} weight="regular" />
        홈으로
      </Link>

      <header className="mt-4 flex flex-col gap-2 animate-slide-up">
        <h1 className="text-3xl font-semibold tracking-tight text-base-900">
          오픈소스 attribution
        </h1>
        <p className="max-w-[55ch] text-sm text-base-500">
          SplatHub은 다음 오픈소스 구성요소 위에 만들어졌습니다. 상업 사용이 가능한
          라이선스만 선별해서 포함했으며, 비상업 라이선스는 의도적으로 배제했습니다.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="mb-5 text-xs font-medium uppercase tracking-[0.12em] text-base-500">
          사용 중 · 상업 라이선스 OK
        </h2>
        <dl className="divide-y divide-base-100 border-y border-base-100">
          {ALLOWED.map((item) => (
            <LicenseRow key={item.name} item={item} />
          ))}
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-danger">
          사용 금지 · 비상업 라이선스
        </h2>
        <p className="mb-5 max-w-[55ch] text-xs text-base-500">
          CI에서 dependency tree를 스캔해 이 목록의 패키지가 들어오면 빌드를
          실패시킵니다.
        </p>
        <dl className="divide-y divide-base-100 border-y border-base-100">
          {BANNED.map((item) => (
            <LicenseRow key={item.name} item={item} banned />
          ))}
        </dl>
      </section>

      <section className="mt-12 border-t border-base-100 pt-8">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-base-500">
          사용자 생성 콘텐츠
        </h2>
        <p className="max-w-[55ch] text-sm text-base-600">
          무료 변환으로 생성된 모델은 기본{' '}
          <span className="font-mono text-base-900">CC-BY-NC 4.0</span> 로 공개됩니다.
          크리에이터는 업로드 직후 CC-BY 또는 CC0로 변경할 수 있습니다.
        </p>
        <p className="mt-2 max-w-[55ch] text-sm text-base-600">
          Phase 2 유료 학습으로 생성된 모델은 크리에이터가 완전 소유하며, 마켓플레이스에서
          상업 라이선스로 판매할 수 있습니다 (수수료 20%).
        </p>
      </section>
    </main>
  );
}

function LicenseRow({ item, banned = false }: { item: LicenseItem; banned?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <div className="flex flex-col gap-0.5">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-sm font-medium transition-colors ${
            banned
              ? 'text-base-500 line-through hover:text-base-700'
              : 'text-base-900 hover:text-accent-bright'
          }`}
        >
          {item.name}
        </a>
        <span className="text-xs text-base-500">{item.purpose}</span>
      </div>
      <span
        className={`flex-shrink-0 font-mono text-xs ${
          banned ? 'text-danger' : 'text-base-600'
        }`}
      >
        {item.license}
      </span>
    </div>
  );
}
