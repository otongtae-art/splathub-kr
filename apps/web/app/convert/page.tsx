'use client';

/**
 * /convert — 이미지/영상 파일 업로드 기반 변환 페이지.
 *
 * 흐름:
 *   1) PhotoDropzone → 파일 선택 + R2 업로드 + /api/jobs 생성 → jobId 획득
 *   2) JobProgress → jobId 폴링, 진행률 실시간 표시
 *   3) 완료 시 ViewerShell → 결과 .spz 미리보기
 *
 * M1 에서는 아직 인증/DB가 없어 "게시" 단계가 빠져 있다.
 * M4 에서 /m/[slug] 로 자동 redirect 되도록 확장.
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import Link from 'next/link';
import PhotoDropzone from '@/components/upload/PhotoDropzone';
import JobProgress from '@/components/upload/JobProgress';

const ViewerShell = dynamic(() => import('@/components/viewer/ViewerShell'), { ssr: false });

export default function ConvertPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [resultSpzUrl, setResultSpzUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-4xl flex-col gap-8 px-6 py-10 safe-top safe-bottom sm:px-10 sm:py-14">
      <header className="flex items-baseline justify-between">
        <div>
          <Link href="/" className="text-xs text-ink-400 hover:text-ink-100">
            ← SplatHub
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">사진으로 3D 만들기</h1>
          <p className="mt-1 text-sm text-ink-300">
            1-5장의 사진을 올리면 <span className="text-ink-50">.spz</span> 파일로 변환됩니다.
          </p>
        </div>
        <Link
          href="/capture"
          className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-sm text-ink-100 hover:border-ink-500"
        >
          📷 카메라로 바로 찍기
        </Link>
      </header>

      {!jobId && (
        <section>
          <PhotoDropzone
            onJobCreated={(id) => {
              setJobId(id);
              setResultSpzUrl(null);
              setFailed(false);
            }}
          />
        </section>
      )}

      {jobId && !resultSpzUrl && !failed && (
        <section className="flex flex-col gap-3">
          <JobProgress
            jobId={jobId}
            onDone={(snap) => {
              // M1에서는 HF Space callback payload의 spz_url이 직접 result로 전달된다.
              // 실제 snapshot 구조에 따라 M3/M4에서 다시 쿼리(GET /api/models)하거나
              // WorkerCallbackPayload의 result.spz_url을 jobs 테이블에 저장한 뒤 꺼낸다.
              // 지금은 단순히 완료 표시만 하고 사용자가 /m 또는 /explore로 이동하도록 유도.
              void snap;
              setResultSpzUrl(`/api/jobs/${jobId}/spz`); // TODO(M3): 실제 URL로 교체
            }}
            onError={() => setFailed(true)}
          />
          <button
            type="button"
            onClick={() => {
              setJobId(null);
              setFailed(false);
            }}
            className="self-start text-xs text-ink-400 hover:text-ink-100"
          >
            작업 취소하고 다시 시작
          </button>
        </section>
      )}

      {resultSpzUrl && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">결과 미리보기</h2>
          <div className="h-[60dvh] overflow-hidden rounded-xl border border-ink-800 bg-ink-900">
            <ViewerShell url={resultSpzUrl} minimal />
          </div>
          <button
            type="button"
            onClick={() => {
              setJobId(null);
              setResultSpzUrl(null);
            }}
            className="self-start rounded-md border border-ink-700 bg-ink-800 px-3 py-1.5 text-sm"
          >
            한 번 더 만들기
          </button>
        </section>
      )}

      {failed && (
        <section className="rounded-xl border border-red-500/40 bg-red-500/5 p-5">
          <h2 className="text-base font-semibold text-red-200">변환 실패</h2>
          <p className="mt-1 text-sm text-red-200/80">
            입력 사진이 너무 흐리거나 대상 주변 각도가 부족할 수 있습니다. 조금 더 다양한 각도에서 촬영한
            사진으로 다시 시도해 주세요.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setJobId(null);
                setFailed(false);
              }}
              className="rounded-md bg-ink-800 px-3 py-1.5 text-sm text-ink-100 hover:bg-ink-700"
            >
              다시 올리기
            </button>
            <Link
              href="/convert/local"
              className="rounded-md border border-ink-700 px-3 py-1.5 text-sm text-ink-200 hover:border-ink-500"
            >
              내 PC로 직접 만들기 (WebGPU) →
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
