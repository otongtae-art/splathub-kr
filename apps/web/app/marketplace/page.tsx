'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Heart, DownloadSimple, Cube } from '@phosphor-icons/react/dist/ssr';

type MarketItem = {
  id: string;
  title: string;
  creator: string;
  price: number;
  likes: number;
  downloads: number;
  tags: string[];
};

const SAMPLE_ITEMS: MarketItem[] = [
  {
    id: 'market-1',
    title: '프리미엄 카페 인테리어',
    creator: 'creator_A',
    price: 9900,
    likes: 42,
    downloads: 15,
    tags: ['인테리어', '카페'],
  },
  {
    id: 'market-2',
    title: '한옥 마당 전경',
    creator: 'creator_B',
    price: 19900,
    likes: 128,
    downloads: 38,
    tags: ['건축', '한옥', '전통'],
  },
  {
    id: 'market-3',
    title: '피규어 컬렉션 세트',
    creator: 'creator_C',
    price: 4900,
    likes: 67,
    downloads: 22,
    tags: ['피규어', '취미'],
  },
];

const CATEGORIES = ['전체', '인테리어', '건축', '제품', '음식', '인물', '자연'];

export default function MarketplacePage() {
  const [category, setCategory] = useState('전체');

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <nav className="flex items-center justify-between border-b border-base-100 px-5 py-3.5 sm:px-8">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-base-900"
          >
            SplatHub
          </Link>
          <span className="text-sm text-base-500">마켓플레이스</span>
          <span className="rounded-sm border border-accent/30 bg-accent/[0.04] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-accent-bright">
            Coming Soon
          </span>
        </div>
        <div className="flex items-center gap-0.5 text-sm">
          <Link
            href="/explore"
            className="tactile rounded-md px-3 py-1.5 text-base-600 transition-colors hover:bg-base-50 hover:text-base-900"
          >
            무료 갤러리
          </Link>
          <Link
            href="/"
            className="tactile rounded-md px-3 py-1.5 text-base-600 transition-colors hover:bg-base-50 hover:text-base-900"
          >
            대시보드
          </Link>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-8 flex flex-col gap-1 animate-slide-up">
          <h1 className="text-3xl font-semibold tracking-tight text-base-900">
            크리에이터 마켓플레이스
          </h1>
          <p className="max-w-[55ch] text-sm text-base-500">
            크리에이터가 직접 가격을 매긴 프리미엄 3D 모델. 수수료 20%, 수익의 80%가
            크리에이터에게 정산됩니다.
          </p>
        </header>

        <div className="mb-8 flex flex-wrap gap-1 border-b border-base-100 pb-5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                category === cat
                  ? 'bg-base-900 text-base-0'
                  : 'text-base-600 hover:bg-base-50 hover:text-base-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLE_ITEMS.map((item, idx) => (
            <article
              key={item.id}
              className={`flex flex-col gap-3 animate-slide-up stagger-${Math.min(idx + 1, 5)}`}
            >
              <div className="group aspect-[4/3] overflow-hidden rounded-md border border-base-100 bg-base-50">
                <div className="flex h-full items-center justify-center">
                  <Cube size={36} weight="thin" className="text-base-400" />
                </div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-sm font-medium text-base-900">{item.title}</h3>
                  <p className="text-xs text-base-500">@{item.creator}</p>
                </div>
                <span className="font-mono text-sm font-medium text-base-900">
                  ₩{item.price.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-base-100 pt-3">
                <div className="flex items-center gap-3 text-xs text-base-500">
                  <span className="inline-flex items-center gap-1">
                    <Heart size={11} weight="regular" />
                    {item.likes}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <DownloadSimple size={11} weight="regular" />
                    {item.downloads}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    alert('마켓플레이스 결제 기능은 Phase 2에서 활성화됩니다.')
                  }
                  className="tactile rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-base-0 transition-colors hover:bg-accent-bright"
                >
                  구매
                </button>
              </div>
            </article>
          ))}
        </div>

        <section className="mt-14 border-t border-base-100 pt-10">
          <h2 className="mb-6 text-xs font-medium uppercase tracking-[0.12em] text-base-500">
            수수료 구조
          </h2>
          <dl className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <FeeRow
              value="80%"
              label="크리에이터 수익"
              text="판매 금액의 80%가 크리에이터에게 정산됩니다."
            />
            <FeeRow
              value="20%"
              label="플랫폼 수수료"
              text="GPU 운영, 인프라, 결제 처리 비용으로 사용됩니다."
            />
            <FeeRow
              value="₩0 ~"
              label="자유 가격"
              text="₩0부터 자유롭게 설정. 무료 공유도 가능합니다."
            />
          </dl>
        </section>
      </main>
    </div>
  );
}

function FeeRow({
  value,
  label,
  text,
}: {
  value: string;
  label: string;
  text: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-3xl tracking-tight text-base-900">
        {value}
      </span>
      <span className="text-sm font-medium text-base-800">{label}</span>
      <p className="max-w-[30ch] text-xs leading-relaxed text-base-500">{text}</p>
    </div>
  );
}
