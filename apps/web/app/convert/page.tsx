'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera } from '@phosphor-icons/react/dist/ssr';
import PhotoDropzone from '@/components/upload/PhotoDropzone';
import JobProgress from '@/components/upload/JobProgress';
// PhotoDropzone의 새로운 onJobCreated 시그니처(jobId, thumbnailUrl)와 호환

const ViewerShell = dynamic(() => import('@/components/viewer/ViewerShell'), {
  ssr: false,
});

export default function ConvertPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [resultSpzUrl, setResultSpzUrl] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col gap-8 px-6 py-10 safe-top safe-bottom sm:px-10 sm:py-14">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-base-500 transition-colors hover:text-base-800"
          >
            <ArrowLeft size={11} weight="regular" />
            SplatHub
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-base-900">
            사진으로 3D 만들기
          </h1>
          <p className="text-sm text-base-500">
            1–5장의 사진을 올리면 .spz 파일로 변환됩니다.
          </p>
        </div>
        <Link
          href="/capture"
          className="tactile inline-flex items-center gap-1.5 rounded-md border border-base-200 bg-base-50 px-3 py-1.5 text-sm text-base-700 transition-colors hover:border-base-300"
        >
          <Camera size={13} weight="regular" />
          카메라로 찍기
        </Link>
      </header>

      {!jobId && (
        <section className="animate-slide-up">
          <PhotoDropzone
            onJobCreated={(id) => {
              setJobId(id);
              setResultSpzUrl(null);
              setFailed(false);
            }}
          />
          {/* onJobCreated 2번째 인자(thumbnailUrl)는 여기선 미사용 */}
        </section>
      )}

      {jobId && !resultSpzUrl && !resultBytes && !failed && (
        <section className="flex flex-col gap-3 animate-fade-in">
          <JobProgress
            jobId={jobId}
            onDone={(snap) => {
              if (snap.result_ply_bytes) {
                setResultBytes(snap.result_ply_bytes);
                setResultSpzUrl(null);
              } else {
                setResultSpzUrl(snap.result_ply_url || '/samples/butterfly.spz');
                setResultBytes(null);
              }
            }}
            onError={() => setFailed(true)}
          />
          <button
            type="button"
            onClick={() => {
              setJobId(null);
              setFailed(false);
            }}
            className="self-start text-xs text-base-500 transition-colors hover:text-base-800"
          >
            작업 취소하고 다시 시작
          </button>
        </section>
      )}

      {(resultSpzUrl || resultBytes) && (
        <section className="flex flex-col gap-3 animate-scale-in">
          <h2 className="text-base font-medium text-base-800">결과 미리보기</h2>
          <div className="h-[60dvh] overflow-hidden rounded-md border border-base-100 bg-base-0">
            <ViewerShell
              url={resultSpzUrl ?? undefined}
              fileBytes={resultBytes ?? undefined}
              fileType="splat"
              minimal
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setJobId(null);
              setResultSpzUrl(null);
              setResultBytes(null);
            }}
            className="tactile self-start rounded-md border border-base-200 bg-base-50 px-3 py-1.5 text-sm text-base-700 hover:border-base-300"
          >
            한 번 더 만들기
          </button>
        </section>
      )}

      {failed && (
        <section className="flex flex-col gap-3 rounded-md border border-danger/30 bg-danger/[0.04] p-5 animate-fade-in">
          <h2 className="text-sm font-medium text-danger">변환 실패</h2>
          <p className="text-sm text-base-600">
            입력 사진이 너무 흐리거나 대상 주변 각도가 부족할 수 있습니다. 조금 더 다양한
            각도에서 촬영한 사진으로 다시 시도해 주세요.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setJobId(null);
                setFailed(false);
              }}
              className="tactile rounded-md bg-base-100 px-3 py-1.5 text-sm text-base-800 hover:bg-base-200"
            >
              다시 올리기
            </button>
            <Link
              href="/convert/local"
              className="tactile rounded-md border border-base-200 px-3 py-1.5 text-sm text-base-700 hover:border-base-300"
            >
              내 PC로 직접 만들기 (WebGPU)
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
