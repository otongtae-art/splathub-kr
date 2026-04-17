'use client';

/**
 * /explore — 모델 갤러리 (superspl.at 스타일).
 * 트렌딩/최신/좋아요 정렬 + 태그 필터 + 검색.
 * Supabase 연결 시 실제 DB 쿼리, 미연결 시 샘플 데이터.
 */

import Link from 'next/link';
import { useState } from 'react';
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

  // TODO: Supabase 연결 시 실제 쿼리로 교체
  const models = SAMPLE_MODELS.filter((m) =>
    search ? m.title.toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <nav className="flex items-center justify-between border-b border-ink-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-bold text-accent-500">
            SplatHub
          </Link>
          <span className="text-sm text-ink-400">탐색</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link href="/" className="rounded-md px-3 py-1.5 text-ink-300 hover:text-ink-50">
            대시보드
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-accent-500 px-3 py-1.5 text-ink-900 font-semibold"
          >
            로그인
          </Link>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {/* 필터 바 */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-ink-700 bg-ink-800/40 p-0.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSort(opt.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  sort === opt.value
                    ? 'bg-accent-500 text-ink-900'
                    : 'text-ink-300 hover:text-ink-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border border-ink-700 bg-ink-800/40 p-0.5">
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTime(opt.value)}
                className={`rounded-md px-2.5 py-1.5 text-xs transition ${
                  time === opt.value
                    ? 'bg-ink-700 text-ink-50'
                    : 'text-ink-400 hover:text-ink-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="모델 검색..."
            className="ml-auto rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-50 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none"
          />
        </div>

        {/* 모델 그리드 */}
        {models.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <p className="text-lg font-semibold text-ink-200">아직 모델이 없습니다</p>
            <p className="text-sm text-ink-400">
              사진을 올려서 첫 3D 모델을 만들어 보세요!
            </p>
            <Link
              href="/"
              className="mt-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-900"
            >
              3D 모델 만들기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {models.map((model) => (
              <Link
                key={model.id}
                href={`/m/${model.slug}`}
                className="group overflow-hidden rounded-xl border border-ink-700 bg-ink-800/40 transition hover:border-ink-500"
              >
                <div className="aspect-[4/3] bg-ink-900">
                  {model.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={model.thumbnail_url}
                      alt={model.title}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl text-ink-600">
                      🧊
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-ink-100 group-hover:text-accent-500">
                    {model.title}
                  </h3>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-ink-400">
                    <span>@{model.author_handle}</span>
                    <span>♥ {model.like_count}</span>
                    <span>👁 {model.view_count}</span>
                  </div>
                  {model.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {model.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-ink-700 px-2 py-0.5 text-[9px] text-ink-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
