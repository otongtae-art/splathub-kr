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
  Cube,
  House,
  MagicWand,
} from '@phosphor-icons/react/dist/ssr';
import PhotoDropzone from '@/components/upload/PhotoDropzone';
import JobProgress from '@/components/upload/JobProgress';
import type { ReconstructionMode } from '@/lib/gen3d';

const ViewerShell = dynamic(() => import('@/components/viewer/ViewerShell'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-base-500">
      뷰어 준비 중
    </div>
  ),
});

const MeshViewer = dynamic(() => import('@/components/viewer/MeshViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-base-500">
      mesh 뷰어 준비 중
    </div>
  ),
});

type ModelEntry = {
  id: string;
  title: string;
  /** 샘플 등 URL 기반 결과 (.spz/.ply) */
  spzUrl: string | null;
  /** 브라우저 생성 .splat 바이트 (Spark 뷰어) */
  plyBytes: Uint8Array | null;
  /** HF Space 생성 .glb 바이트 (GLTF mesh 뷰어) */
  glbBytes: Uint8Array | null;
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
  const [mode, setMode] = useState<ReconstructionMode>('auto');

  const handleJobCreated = useCallback((id: string, thumbnailUrl: string) => {
    setJobId(id);
    setSourceThumbnail(thumbnailUrl);
    setStep('processing');
  }, []);

  const handleJobDone = useCallback(
    (snap: {
      result_ply_url: string | null;
      result_ply_bytes: Uint8Array | null;
      result_glb_bytes: Uint8Array | null;
    }) => {
      // 우선순위: HF Space .glb > 브라우저 .splat > 원격 spz URL.
      // 셋 다 없으면 실패 경로로 떨어뜨림 — 샘플 나비 폴백 금지
      // (사용자가 실제 결과와 샘플을 구분 못 하는 치명적 UX 버그였음).
      const hasGlb = !!snap.result_glb_bytes;
      const hasSplat = !!snap.result_ply_bytes;
      const hasUrl = !!snap.result_ply_url;
      if (!hasGlb && !hasSplat && !hasUrl) {
        setStep('upload');
        setJobId(null);
        return;
      }
      const model: ModelEntry = {
        id: jobId || `model-${Date.now()}`,
        title: `모델 ${String(myModels.length + 1).padStart(2, '0')}`,
        spzUrl: hasGlb || hasSplat ? null : snap.result_ply_url,
        plyBytes: snap.result_ply_bytes,
        glbBytes: snap.result_glb_bytes,
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
              <header className="flex flex-col gap-2.5">
                <h1 className="text-4xl font-semibold tracking-tight text-base-900 sm:text-[44px]">
                  사진으로 <span className="text-accent">진짜 3D</span> 만들기
                </h1>
                <p className="max-w-[55ch] text-base leading-relaxed text-base-600">
                  물체 주변을 걸으며 사진 20장 찍으면 끝. AI 가 상상하는 게 아니라
                  실제 측정으로 3D 재구성합니다. 모든 경로 서버 비용 0원.
                </p>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-base-500">
                  <span className="rounded-full border border-base-200 bg-base-50 px-2 py-0.5">
                    Meta VGGT
                  </span>
                  <span className="rounded-full border border-base-200 bg-base-50 px-2 py-0.5">
                    Microsoft TRELLIS.2
                  </span>
                  <span className="rounded-full border border-base-200 bg-base-50 px-2 py-0.5">
                    Brush WebGPU
                  </span>
                  <span className="rounded-full border border-accent/30 bg-accent/[0.05] px-2 py-0.5 text-accent">
                    무료 · 한국어
                  </span>
                </div>
              </header>

              {/* 2갈래 경로 선택 */}
              <div className="grid gap-3 sm:grid-cols-2">
                {/* 진짜 3D (권장) */}
                <Link
                  href="/capture"
                  className="tactile group relative flex flex-col gap-2 overflow-hidden rounded-md border border-accent/40 bg-accent/[0.03] p-5 transition-all hover:border-accent/60 hover:bg-accent/[0.06]"
                >
                  <div className="absolute right-3 top-3 rounded-full bg-accent/90 px-2 py-0.5 text-[10px] font-medium tracking-wide text-base-0">
                    권장
                  </div>
                  <div className="flex items-center gap-2 text-accent">
                    <Camera size={16} weight="regular" />
                    <h3 className="text-sm font-semibold">진짜 3D · 다각도 촬영</h3>
                  </div>
                  <p className="text-xs leading-relaxed text-base-600">
                    물체 주변 한 바퀴 걸으며 20장 촬영 →
                    Meta VGGT 가 <b>실측 photogrammetry</b> 로 3D 재구성. 삼성/애플 방식.
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-base-500">
                    <span>⏱ 1~2분</span>
                    <span>🎯 품질 ⭐⭐⭐⭐</span>
                    <span>💻 Chrome 134+</span>
                  </div>
                </Link>

                {/* 빠른 프리뷰 */}
                <div className="flex flex-col gap-2 rounded-md border border-base-200 bg-base-50 p-5">
                  <div className="flex items-center gap-2 text-base-700">
                    <MagicWand size={16} weight="regular" />
                    <h3 className="text-sm font-semibold">빠른 프리뷰 · AI 생성</h3>
                  </div>
                  <p className="text-xs leading-relaxed text-base-500">
                    사진 1장 → TRELLIS 가 3D 를 <b>상상</b>하여 30~60초 안에 결과.
                    뒷면은 부정확할 수 있음 (AI 환각).
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-base-400">
                    <span>⏱ 30~60초</span>
                    <span>🎯 품질 ⭐⭐</span>
                    <span>💻 모든 브라우저</span>
                  </div>
                  <p className="mt-1 text-[11px] text-base-400">
                    ↓ 아래 영역에 사진을 드롭해서 시작
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-base-500">
                <span className="inline-block h-px flex-1 bg-base-200" />
                <span>빠른 프리뷰 업로드</span>
                <span className="inline-block h-px flex-1 bg-base-200" />
              </div>

              {/* 모드 선택 — 자동 / 객체 / 공간 */}
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-base-100 bg-base-50 p-1.5">
                <ModeButton
                  active={mode === 'auto'}
                  onClick={() => setMode('auto')}
                  icon={<MagicWand size={16} weight="regular" />}
                  label="자동"
                  description="AI가 판단"
                  hint="depth 분포로 판별"
                />
                <ModeButton
                  active={mode === 'object'}
                  onClick={() => setMode('object')}
                  icon={<Cube size={16} weight="regular" />}
                  label="객체"
                  description="제품·가구·인형"
                  hint="주변 돌며 촬영"
                />
                <ModeButton
                  active={mode === 'scene'}
                  onClick={() => setMode('scene')}
                  icon={<House size={16} weight="regular" />}
                  label="공간"
                  description="방·아파트"
                  hint="제자리 회전"
                />
              </div>

              <PhotoDropzone onJobCreated={handleJobCreated} mode={mode} />

              <aside className="divide-y divide-base-100 border-t border-base-100 pt-6">
                {mode === 'auto' && (
                  <>
                    <TipRow
                      label="자동"
                      text="어떻게 찍어도 OK. depth 분포를 분석해 객체·공간을 판별합니다."
                    />
                    <TipRow
                      label="팁"
                      text="객체는 주변을 돌면서, 공간은 제자리 회전. 둘 다 가능."
                    />
                  </>
                )}
                {mode === 'object' && (
                  <>
                    <TipRow
                      label="촬영"
                      text="대상 주변을 천천히 한 바퀴 돌면서 같은 거리에서 촬영."
                    />
                    <TipRow
                      label="시점"
                      text="카메라를 대상 중심에 맞추고 안쪽을 바라봅니다."
                    />
                  </>
                )}
                {mode === 'scene' && (
                  <>
                    <TipRow
                      label="촬영"
                      text="한 지점에 서서 제자리에서 90도씩 회전하며 촬영."
                    />
                    <TipRow
                      label="시점"
                      text="벽·가구 바깥쪽을 바라보며 가로/세로 모두 담기게."
                    />
                  </>
                )}
                <TipRow label="분량" text="최소 3장, 8장 이상이면 더 정밀." />
                <TipRow
                  label="보정"
                  text="흔들린 사진은 자동 제거, 어두운 사진은 자동 밝기 보정."
                />
                <TipRow
                  label="AI"
                  text="첫 사용 시 Depth Anything V2(~50MB) 자동 다운로드."
                />
                <TipRow label="형식" text="JPEG · PNG · HEIC · 장당 10MB 이하." />
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
                {currentModel.glbBytes ? (
                  <MeshViewer fileBytes={currentModel.glbBytes} autoRotate />
                ) : (
                  <ViewerShell
                    url={currentModel.spzUrl ?? undefined}
                    fileBytes={currentModel.plyBytes ?? undefined}
                    fileType="splat"
                    autoRotate
                    minimal
                  />
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-base-100 pt-4">
                <a
                  href={downloadHref(currentModel)}
                  download={`${currentModel.title}.${currentModel.plyBytes ? 'splat' : 'spz'}`}
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

function ModeButton({
  active,
  onClick,
  icon,
  label,
  description,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tactile flex flex-col items-start gap-1 rounded-md p-3 text-left transition-colors ${
        active
          ? 'bg-base-0 text-base-900 shadow-sm'
          : 'text-base-600 hover:bg-base-100 hover:text-base-800'
      }`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-xs text-base-500">{description}</span>
      <span
        className={`text-[11px] ${active ? 'text-accent-bright' : 'text-base-400'}`}
      >
        {hint}
      </span>
    </button>
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

/**
 * ModelEntry의 다운로드 URL을 생성.
 * plyBytes가 있으면 즉석에서 Blob URL로 감싸고, 없으면 원격 URL 반환.
 */
function downloadHref(model: ModelEntry): string {
  if (model.plyBytes) {
    // eslint-disable-next-line no-underscore-dangle
    const w = window as unknown as { __splathub_blob_cache?: Map<string, string> };
    if (!w.__splathub_blob_cache) w.__splathub_blob_cache = new Map();
    const cached = w.__splathub_blob_cache.get(model.id);
    if (cached) return cached;
    const blob = new Blob([model.plyBytes as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    w.__splathub_blob_cache.set(model.id, url);
    return url;
  }
  return model.spzUrl ?? '#';
}
