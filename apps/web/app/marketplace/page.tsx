'use client';

/**
 * /marketplace — Phase 2 마켓플레이스 화면.
 * 크리에이터가 가격을 책정한 유료 모델을 탐색·구매할 수 있다.
 * 수수료 20% (크리에이터 80%).
 */

import Link from 'next/link';
import { useState } from 'react';

type MarketItem = {
  id: string;
  title: string;
  creator: string;
  price: number; // KRW
  thumbnail: string;
  likes: number;
  downloads: number;
  tags: string[];
};

// TODO: Supabase에서 listing_type='paid' 모델 쿼리
const SAMPLE_ITEMS: MarketItem[] = [
  {
    id: 'market-1',
    title: '프리미엄 카페 인테리어',
    creator: 'creator_A',
    price: 9900,
    thumbnail: '',
    likes: 42,
    downloads: 15,
    tags: ['인테리어', '카페'],
  },
  {
    id: 'market-2',
    title: '한옥 마당 전경',
    creator: 'creator_B',
    price: 19900,
    thumbnail: '',
    likes: 128,
    downloads: 38,
    tags: ['건축', '한옥', '전통'],
  },
  {
    id: 'market-3',
    title: '피규어 컬렉션 세트',
    creator: 'creator_C',
    price: 4900,
    thumbnail: '',
    likes: 67,
    downloads: 22,
    tags: ['피규어', '취미'],
  },
];

export default function MarketplacePage() {
  const [category, setCategory] = useState('all');

  const categories = ['all', '인테리어', '건축', '제품', '음식', '인물', '자연'];

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <nav className="flex items-center justify-between border-b border-ink-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-bold text-accent-500">
            SplatHub
          </Link>
          <span className="text-sm text-ink-400">마켓플레이스</span>
          <span className="rounded-full border border-accent-500/30 bg-accent-500/10 px-2 py-0.5 text-[9px] font-bold text-accent-400">
            COMING SOON
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link href="/explore" className="rounded-md px-3 py-1.5 text-ink-300 hover:text-ink-50">
            무료 갤러리
          </Link>
          <Link href="/" className="rounded-md px-3 py-1.5 text-ink-300 hover:text-ink-50">
            대시보드
          </Link>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {/* 카테고리 */}
        <div className="mb-6 flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                category === cat
                  ? 'bg-accent-500 text-ink-900 font-semibold'
                  : 'border border-ink-700 text-ink-300 hover:border-ink-500'
              }`}
            >
              {cat === 'all' ? '전체' : cat}
            </button>
          ))}
        </div>

        {/* 수수료 안내 배너 */}
        <div className="mb-6 flex items-center justify-between rounded-xl border border-accent-500/20 bg-accent-500/5 p-4">
          <div>
            <h2 className="text-sm font-semibold text-accent-400">크리에이터가 되세요</h2>
            <p className="mt-1 text-xs text-ink-300">
              3D 모델을 만들어 판매하세요. 수수료 20%, 수익의 80%가 내 것.
              ₩0 무료 공유도 가능합니다.
            </p>
          </div>
          <Link
            href="/"
            className="flex-shrink-0 rounded-lg bg-accent-500 px-4 py-2 text-xs font-semibold text-ink-900"
          >
            모델 만들기
          </Link>
        </div>

        {/* 마켓 그리드 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLE_ITEMS.map((item) => (
            <div
              key={item.id}
              className="overflow-hidden rounded-xl border border-ink-700 bg-ink-800/40"
            >
              <div className="aspect-[4/3] bg-ink-900">
                <div className="flex h-full items-center justify-center text-4xl text-ink-600">
                  🧊
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-100">{item.title}</h3>
                    <p className="mt-0.5 text-[10px] text-ink-400">@{item.creator}</p>
                  </div>
                  <div className="rounded-lg bg-accent-500/10 px-2.5 py-1 text-sm font-bold text-accent-400">
                    ₩{item.price.toLocaleString()}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 text-[10px] text-ink-400">
                  <span>♥ {item.likes}</span>
                  <span>⬇ {item.downloads}</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-ink-700 px-2 py-0.5 text-[9px] text-ink-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-accent-500 py-2 text-xs font-semibold text-ink-900 transition hover:bg-accent-400"
                    onClick={() => alert('마켓플레이스 결제 기능은 Phase 2에서 활성화됩니다.')}
                  >
                    구매하기
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-xs text-ink-200 hover:border-ink-400"
                  >
                    미리보기
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 수수료 구조 설명 */}
        <div className="mt-10 rounded-xl border border-ink-700/50 bg-ink-800/20 p-6">
          <h3 className="text-base font-semibold text-ink-100">수수료 구조</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-ink-700 p-4">
              <div className="text-2xl font-bold text-accent-500">80%</div>
              <div className="mt-1 text-sm text-ink-300">크리에이터 수익</div>
              <p className="mt-2 text-xs text-ink-400">
                판매 금액의 80%가 크리에이터에게 정산됩니다.
              </p>
            </div>
            <div className="rounded-lg border border-ink-700 p-4">
              <div className="text-2xl font-bold text-ink-200">20%</div>
              <div className="mt-1 text-sm text-ink-300">플랫폼 수수료</div>
              <p className="mt-2 text-xs text-ink-400">
                GPU 운영, 인프라, 결제 처리 비용으로 사용됩니다.
              </p>
            </div>
            <div className="rounded-lg border border-ink-700 p-4">
              <div className="text-2xl font-bold text-green-400">₩0~</div>
              <div className="mt-1 text-sm text-ink-300">자유 가격</div>
              <p className="mt-2 text-xs text-ink-400">
                ₩0부터 자유롭게 설정. 무료 공유도 가능합니다.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
