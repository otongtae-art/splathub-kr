'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MagnifyingGlass, Heart, Eye } from '@phosphor-icons/react/dist/ssr';
import { SAMPLE_MODELS } from '@/lib/samples';

const SORT_OPTIONS = [
  { value: 'trending', label: '트렌딩' },
  { value: 'new', label: '최신' },
  { value: 'likes', label: '좋아요' },
] as const;

const TIME_OPTIONS = [
  { value: 'day', label: '오늘' },
  { value: 'week', label: '이번 주' },
  { value: 'month', label: '이번 달' },
  { value: 'all', label: '전체' },
] as const;

export default function ExplorePage() {
  const [sort, setSort] = useState('trending');
  const [time, setTime] = useState('week');
  const [search, setSearch] = useState('');

  const models = SAMPLE_MODELS.filter((m) =>
    search ? m.title.toLowerCase().includes(search.toLowerCase()) : true,
  );

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
          <span className="text-sm text-base-500">탐색</span>
        </div>
        <div className="flex items-center gap-0.5 text-sm">
          <Link
            href="/"
            className="tactile rounded-md px-3 py-1.5 text-base-600 transition-colors hover:bg-base-50 hover:text-base-900"
          >
            대시보드
          </Link>
          <Link
            href="/login"
            className="tactile ml-1 rounded-md bg-accent px-3 py-1.5 font-medium text-base-0 transition-colors hover:bg-accent-bright"
          >
            로그인
          </Link>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-8 flex flex-col gap-1 animate-slide-up">
          <h1 className="text-3xl font-semibold tracking-tight text-base-900">
            모델 탐색
          </h1>
          <p className="text-sm text-base-500">
            커뮤니티가 만든 3D Gaussian Splat 모델을 둘러보세요.
          </p>
        </header>

        <div className="mb-8 flex flex-wrap items-center gap-3 border-b border-base-100 pb-5">
          <div className="flex overflow-hidden rounded-md border border-base-200">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSort(opt.value)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  sort === opt.value
                    ? 'bg-base-900 text-base-0'
                    : 'bg-base-50 text-base-600 hover:text-base-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTime(opt.value)}
                className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  time === opt.value
                    ? 'text-base-900'
                    : 'text-base-500 hover:text-base-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative ml-auto">
            <MagnifyingGlass
              size={14}
              weight="regular"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-base-500"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색"
              className="w-48 rounded-md border border-base-200 bg-base-50 py-1.5 pl-8 pr-3 text-sm text-base-900 placeholder:text-base-500 focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {models.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="text-lg font-medium text-base-800">아직 모델이 없습니다</p>
            <p className="max-w-xs text-sm text-base-500">
              사진을 올려서 첫 3D 모델을 만들어 보세요.
            </p>
            <Link
              href="/"
              className="tactile mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-base-0"
            >
              모델 만들기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {models.map((model, idx) => (
              <Link
                key={model.id}
                href={`/m/${model.slug}`}
                className={`group flex flex-col gap-3 animate-slide-up stagger-${Math.min(idx + 1, 5)}`}
              >
                <div className="aspect-[4/3] overflow-hidden rounded-md border border-base-100 bg-base-50">
                  {model.thumbnail_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={model.thumbnail_url}
                      alt={model.title}
                      className="h-full w-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-base-400">
                      <span className="font-mono text-xs">3D</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium text-base-900 transition-colors group-hover:text-accent-bright">
                    {model.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-base-500">
                    <span>@{model.author_handle}</span>
                    <span className="inline-flex items-center gap-1">
                      <Heart size={11} weight="regular" />
                      {model.like_count}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye size={11} weight="regular" />
                      {model.view_count}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
