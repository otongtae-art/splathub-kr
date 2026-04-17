'use client';

/**
 * / (메인 대시보드) — taste-skill 원칙 적용
 *
 * 변경:
 * - 이모지 → Phosphor 아이콘
 * - 그라데이션/glow 제거, 단일 accent(Emerald)만 사용
 * - tracking-tighter 타이포그래피
 * - 카드 중첩 제거 → border-t/divide-y 로 그룹핑
 * - tactile feedback (active translate-y)
 * - 페이지 enter 스태거 애니메이션
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import {
  Camera,
  Compass,
  Storefront,
  SignIn,
  Copy,
  Check,
  DownloadSimple,
  Plus,
} from '@phosphor-icons/react/dist/ssr';
import PhotoDropzone from '@/components/upload/PhotoDropzone';
import JobProgress from '@/components/upload/JobProgress';

const ViewerShell = dynamic(() => import('@/components/viewer/ViewerShell'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-base-500">
      뷰어 준비 중
    </div>
  ),
});

type ModelEntry = {
  id: string;
  title: string;
  spzUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
};

export default function DashboardPage() {
  const [step, setStep] = useState<'upload' | 'processing' | 'view'>('upload');
  const [jobId, setJobId] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<ModelEntry | null>(null);
  const [myModels, setMyModels] = useState<ModelEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [sourceThumbnail, setSourceThumbnail] = useState<string | null>(null);

  const handleJobCreated = useCallback((id: string, thumbnailUrl: string) => {
    setJobId(id);
    setSourceThumbnail(thumbnailUrl);
    setStep('processing');
  }, []);

  const handleJobDone = useCallback(
    (snap: { result_ply_url: string | null }) => {
      const model: ModelEntry = {
        id: jobId || `model-${Date.now()}`,
        title: `모델 ${String(myModels.length + 1).padStart(2, '0')}`,
        // gen3d가 생성한 실제 .ply Blob URL 우선, 실패 시 샘플로 폴백
        spzUrl: snap.result_ply_url || '/samples/butterfly.spz',
        thumbnailUrl: sourceThumbnail,
        createdAt: new Date().toLocaleString('ko-KR'),
      };
      setCurrentModel(model);
      setMyModels((prev) => [model, ...prev]);
      setStep('view');
    },
    [jobId, myModels.length, sourceThumbnail],
  );

  const handleJobError = useCallback(() => {
    setStep('upload');
    setJobId(null);
  }, []);

  const resetToUpload = useCallback(() => {
    setStep('upload');
    setJobId(null);
    setCurrentModel(null);
  }, []);

  const copyShareLink = useCallback(() => {
    if (!currentModel) return;
    const url = `${window.location.origin}/m/${currentModel.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [currentModel]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-base-100 px-5 py-3.5 sm:px-8">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-semibold tracking-tight text-base-900">
            SplatHub
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-base-500">
            beta
          </span>
        </div>
        <div className="flex items-center gap-0.5 text-sm">
          <NavLink href="/explore" icon={<Compass size={14} weight="regular" />}>
            탐색
          </NavLink>
          <NavLink href="/marketplace" icon={<Storefront size={14} weight="regular" />}>
            마켓
          </NavLink>
          <NavLink href="/capture" icon={<Camera size={14} weight="regular" />}>
            캡처
          </NavLink>
          <Link
            href="/login"
            className="tactile ml-2 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright"
          >
            <SignIn size={14} weight="regular" />
            로그인
          </Link>
        </div>
      </nav>

      <main className="flex flex-1 flex-col lg:flex-row">
        {/* 메인 작업 영역 */}
        <section className="flex flex-1 flex-col gap-8 p-6 sm:p-10 lg:p-14">
          {step === 'upload' && (
            <div className="flex flex-col gap-6 animate-slide-up">
              <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-semibold tracking-tight text-base-900">
                  사진으로 3D 모델 만들기
                </h1>
                <p className="max-w-[55ch] text-base text-base-600">
                  대상을 여러 각도에서 찍은 사진 1–5장을 올리면 3D Gaussian Splat으로 변환됩니다.
                </p>
              </header>

              <PhotoDropzone onJobCreated={handleJobCreated} />

              <aside className="divide-y divide-base-100 border-t border-base-100 pt-6">
                <TipRow
                  label="각도"
                  text="대상 주변을 천천히 한 바퀴 돌면서 촬영하세요."
                />
                <TipRow
                  label="품질"
                  text="흔들림이 적고 초점이 맞는 사진이 좋습니다."
                />
                <TipRow
                  label="분량"
                  text="최소 3장, 8장 이상이면 더 정밀한 결과를 얻습니다."
                />
                <TipRow
                  label="형식"
                  text="JPEG · PNG · HEIC, 장당 10MB 이하."
                />
              </aside>
            </div>
          )}

          {step === 'processing' && jobId && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <header className="flex flex-col gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight text-base-900">
                  3D 모델 생성 중
                </h1>
                <p className="text-sm text-base-500">
                  보통 30–120초가 소요됩니다. 이 페이지를 벗어나지 마세요.
                </p>
              </header>
              <JobProgress
                jobId={jobId}
                onDone={handleJobDone}
                onError={handleJobError}
              />
            </div>
          )}

          {step === 'view' && currentModel && (
            <div className="flex flex-col gap-4 animate-scale-in">
              <header className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-base-900">
                    {currentModel.title}
                  </h1>
                  <p className="mt-1 text-xs font-mono text-base-500">
                    {currentModel.createdAt}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={copyShareLink}
                    className="tactile inline-flex items-center gap-1.5 rounded-md border border-base-200 bg-base-50 px-3 py-1.5 text-sm text-base-700 transition-colors hover:border-base-300 hover:text-base-900"
                  >
                    {copied ? (
                      <>
                        <Check size={13} weight="bold" />
                        복사됨
                      </>
                    ) : (
                      <>
                        <Copy size={13} weight="regular" />
                        공유 링크
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={resetToUpload}
                    className="tactile inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright"
                  >
                    <Plus size={13} weight="bold" />
                    새 모델
                  </button>
                </div>
              </header>

              <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-base-100 bg-base-0 sm:aspect-[16/10]">
                <ViewerShell url={currentModel.spzUrl} autoRotate minimal />
              </div>

              <div className="flex items-center gap-2 border-t border-base-100 pt-4">
                <a
                  href={currentModel.spzUrl}
                  download={`${currentModel.title}.spz`}
                  className="tactile inline-flex items-center gap-1.5 rounded-md border border-base-200 bg-base-50 px-3 py-1.5 text-sm text-base-700 transition-colors hover:border-base-300 hover:text-base-900"
                >
                  <DownloadSimple size={13} weight="regular" />
                  .spz 다운로드
                </a>
              </div>
            </div>
          )}
        </section>

        {/* 사이드바 */}
        <aside className="w-full border-t border-base-100 p-6 sm:p-8 lg:w-80 lg:border-l lg:border-t-0 lg:p-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-base-700">내 모델</h2>
            <span className="font-mono text-xs text-base-500">
              {String(myModels.length).padStart(2, '0')}
            </span>
          </div>

          {myModels.length === 0 ? (
            <p className="mt-4 text-xs text-base-500">아직 생성한 모델이 없습니다.</p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-base-100 border-y border-base-100">
              {myModels.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentModel(m);
                      setStep('view');
                    }}
                    className={`tactile flex w-full items-center gap-3 px-0 py-3 text-left transition-colors ${
                      currentModel?.id === m.id
                        ? 'text-accent-bright'
                        : 'text-base-700 hover:text-base-900'
                    }`}
                  >
                    {m.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.thumbnailUrl}
                        alt=""
                        className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-9 w-9 flex-shrink-0 rounded-md bg-base-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.title}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-base-500">
                        {m.createdAt}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <section className="mt-10 space-y-2.5">
            <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-base-500">
              플랫폼
            </h3>
            <dl className="divide-y divide-base-100 border-y border-base-100">
              <StatRow label="무료 변환" value="5건 / 일" />
              <StatRow label="뷰어" value="Spark.js" />
              <StatRow label="엔진" value="VGGT + FreeSplatter" />
              <StatRow label="출력" value=".spz" />
              <StatRow label="라이선스" value="CC-BY-NC" />
            </dl>
          </section>
        </aside>
      </main>

      <footer className="border-t border-base-100 px-6 py-4 text-[11px] text-base-500 sm:px-8">
        <div className="flex items-center justify-between">
          <span>SplatHub · MIT · 2026</span>
          <Link href="/licenses" className="hover:text-base-700">
            오픈소스 attribution
          </Link>
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="tactile inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-base-600 transition-colors hover:bg-base-50 hover:text-base-900"
    >
      {icon}
      {children}
    </Link>
  );
}

function TipRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-baseline gap-4 py-2.5">
      <span className="w-12 flex-shrink-0 text-xs font-medium uppercase tracking-[0.08em] text-base-500">
        {label}
      </span>
      <span className="text-sm text-base-700">{text}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <dt className="text-sm text-base-600">{label}</dt>
      <dd className="font-mono text-xs text-base-800">{value}</dd>
    </div>
  );
}
