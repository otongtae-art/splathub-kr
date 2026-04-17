'use client';

/**
 * / (메인 대시보드)
 *
 * 비개발자 사용자가 브라우저에서 바로 쓸 수 있는 원스톱 대시보드.
 * 한 페이지에서:
 *   1. 사진 드래그&드롭 업로드
 *   2. 변환 진행률 실시간 표시
 *   3. 완성된 3D 모델 뷰어
 *   4. 내 모델 목록 (히스토리)
 *   5. 공유 링크 복사
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import PhotoDropzone from '@/components/upload/PhotoDropzone';
import JobProgress from '@/components/upload/JobProgress';

const ViewerShell = dynamic(() => import('@/components/viewer/ViewerShell'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-ink-400">
      뷰어 준비 중…
    </div>
  ),
});

type ModelEntry = {
  id: string;
  title: string;
  spzUrl: string;
  createdAt: string;
};

export default function DashboardPage() {
  const [step, setStep] = useState<'upload' | 'processing' | 'view'>('upload');
  const [jobId, setJobId] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<ModelEntry | null>(null);
  const [myModels, setMyModels] = useState<ModelEntry[]>([]);
  const [copied, setCopied] = useState(false);

  const handleJobCreated = useCallback((id: string) => {
    setJobId(id);
    setStep('processing');
  }, []);

  const handleJobDone = useCallback(
    () => {
      // 데모 모드: 실제 spz URL이 아직 없으므로 placeholder
      const model: ModelEntry = {
        id: jobId || `model-${Date.now()}`,
        title: `모델 #${myModels.length + 1}`,
        spzUrl: '/samples/bonsai.spz', // TODO: 실제 결과 URL로 교체
        createdAt: new Date().toLocaleString('ko-KR'),
      };
      setCurrentModel(model);
      setMyModels((prev) => [model, ...prev]);
      setStep('view');
    },
    [jobId, myModels.length],
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
      {/* 상단 네비게이션 */}
      <nav className="flex items-center justify-between border-b border-ink-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-accent-500">SplatHub</h1>
          <span className="rounded-full border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-400">
            Beta
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link href="/explore" className="rounded-md px-3 py-1.5 text-ink-300 hover:text-ink-50">
            탐색
          </Link>
          <Link href="/marketplace" className="rounded-md px-3 py-1.5 text-ink-300 hover:text-ink-50">
            마켓
          </Link>
          <Link href="/capture" className="rounded-md px-3 py-1.5 text-ink-300 hover:text-ink-50">
            📷 캡처
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-accent-500/10 border border-accent-500/30 px-3 py-1.5 text-accent-400 font-semibold hover:bg-accent-500/20"
          >
            로그인
          </Link>
        </div>
      </nav>

      <main className="flex flex-1 flex-col lg:flex-row">
        {/* 왼쪽: 메인 작업 영역 */}
        <section className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
          {/* 1. 업로드 단계 */}
          {step === 'upload' && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-semibold">사진으로 3D 모델 만들기</h2>
                <p className="mt-1 text-sm text-ink-300">
                  대상을 여러 각도에서 찍은 사진 1-5장을 올리면 3D Gaussian Splat으로 변환됩니다.
                </p>
              </div>
              <PhotoDropzone onJobCreated={handleJobCreated} />
              <div className="rounded-lg border border-ink-700/50 bg-ink-800/20 p-4">
                <h3 className="text-sm font-medium text-ink-200">촬영 팁</h3>
                <ul className="mt-2 space-y-1 text-xs text-ink-400">
                  <li>• 대상 주변을 천천히 한 바퀴 돌면서 촬영하세요</li>
                  <li>• 흔들림이 적고 초점이 맞는 사진이 좋습니다</li>
                  <li>• 최소 3장, 추천 8장 이상이면 더 좋은 결과를 얻습니다</li>
                  <li>• JPEG, PNG, HEIC 형식 · 장당 10MB 이하</li>
                </ul>
              </div>
            </div>
          )}

          {/* 2. 변환 진행 단계 */}
          {step === 'processing' && jobId && (
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold">3D 모델 생성 중...</h2>
              <JobProgress
                jobId={jobId}
                onDone={handleJobDone}
                onError={handleJobError}
              />
              <p className="text-xs text-ink-400">
                보통 30~120초 소요됩니다. 이 페이지를 벗어나지 마세요.
              </p>
            </div>
          )}

          {/* 3. 결과 뷰어 */}
          {step === 'view' && currentModel && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{currentModel.title}</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyShareLink}
                    className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 hover:border-ink-400"
                  >
                    {copied ? '복사됨!' : '공유 링크 복사'}
                  </button>
                  <button
                    type="button"
                    onClick={resetToUpload}
                    className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:bg-accent-400"
                  >
                    + 새 모델
                  </button>
                </div>
              </div>
              <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-ink-800 bg-ink-900 sm:aspect-[16/10]">
                <ViewerShell url={currentModel.spzUrl} autoRotate minimal />
              </div>
              <div className="flex gap-2">
                <a
                  href={currentModel.spzUrl}
                  download={`${currentModel.title}.spz`}
                  className="rounded-md border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 hover:border-ink-500"
                >
                  .spz 다운로드
                </a>
              </div>
            </div>
          )}
        </section>

        {/* 오른쪽: 내 모델 히스토리 사이드바 */}
        <aside className="w-full border-t border-ink-800 p-4 sm:p-6 lg:w-80 lg:border-l lg:border-t-0">
          <h3 className="mb-3 text-sm font-semibold text-ink-200">내 모델</h3>
          {myModels.length === 0 ? (
            <p className="text-xs text-ink-500">아직 생성한 모델이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {myModels.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentModel(m);
                      setStep('view');
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      currentModel?.id === m.id
                        ? 'border-accent-500/50 bg-accent-500/5'
                        : 'border-ink-700 bg-ink-800/40 hover:border-ink-500'
                    }`}
                  >
                    <p className="text-sm font-medium text-ink-100">{m.title}</p>
                    <p className="mt-0.5 text-[10px] text-ink-400">{m.createdAt}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 rounded-lg border border-ink-700/50 bg-ink-800/20 p-3">
            <h4 className="text-xs font-medium text-ink-300">플랫폼 정보</h4>
            <dl className="mt-2 space-y-1 text-[10px] text-ink-400">
              <div className="flex justify-between">
                <dt>무료 변환</dt>
                <dd className="text-ink-200">하루 5건</dd>
              </div>
              <div className="flex justify-between">
                <dt>뷰어</dt>
                <dd className="text-ink-200">Spark.js + Three.js</dd>
              </div>
              <div className="flex justify-between">
                <dt>GPU 엔진</dt>
                <dd className="text-ink-200">VGGT + FreeSplatter</dd>
              </div>
              <div className="flex justify-between">
                <dt>출력 포맷</dt>
                <dd className="text-ink-200">.spz (압축)</dd>
              </div>
              <div className="flex justify-between">
                <dt>라이선스</dt>
                <dd className="text-ink-200">CC-BY-NC</dd>
              </div>
            </dl>
          </div>
        </aside>
      </main>

      {/* 하단 */}
      <footer className="border-t border-ink-800 px-4 py-3 text-center text-[10px] text-ink-500">
        SplatHub © 2026 · 고정비 $0 · MIT ·{' '}
        <Link href="/licenses" className="hover:underline">
          오픈소스 attribution
        </Link>
      </footer>
    </div>
  );
}
