'use client';

/**
 * `/convert/local` — WebGPU 로 브라우저에서 직접 Gaussian Splat 학습.
 *
 * Brush (ArthurBrussee/brush, Apache 2.0, Rust + WGSL + WebGPU) 엔진 래핑.
 * 서버 GPU 없이 사용자 기기 GPU 로 학습 → 진짜 $0 경로.
 *
 * 통합 전략:
 *   1차 (현재): 공식 Brush 데모(https://splats.arthurbrussee.com/) 를 iframe
 *               으로 임베드. WebGPU 는 same-origin 제약이 없어 iframe OK.
 *   2차 (self-host): scripts/download-brush.sh 가 Brush 릴리스 번들을
 *                    apps/web/public/brush/ 로 복사. 존재 시 자동 전환.
 *
 * 요구사항:
 *   - Chrome 134+ / Edge 134+ (WebGPU 안정)
 *   - Firefox 는 아직 실험적 — 경고 표시
 *   - 8GB+ VRAM (4K 이상 이미지 학습 시)
 *
 * 참고: https://github.com/ArthurBrussee/brush (Apache 2.0, v0.3.0+)
 */

import { ArrowLeft, Cpu, GithubLogo, Warning } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const LOCAL_BRUSH_PATH = '/brush/index.html';
const HOSTED_BRUSH_URL = 'https://splats.arthurbrussee.com/';

export default function ConvertLocalPage() {
  const [useHosted, setUseHosted] = useState(false);
  const [webgpuSupported, setWebgpuSupported] = useState<boolean | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    // WebGPU 지원 체크
    if (typeof navigator !== 'undefined') {
      const hasGpu = 'gpu' in navigator && !!(navigator as Navigator & { gpu?: unknown }).gpu;
      setWebgpuSupported(hasGpu);
    }

    // self-host 된 Brush 번들이 있는지 체크
    fetch(LOCAL_BRUSH_PATH, { method: 'HEAD' })
      .then((res) => setUseHosted(!res.ok))
      .catch(() => setUseHosted(true));
  }, []);

  const src = useHosted ? HOSTED_BRUSH_URL : LOCAL_BRUSH_PATH;

  if (started) {
    return (
      <div className="flex h-[100dvh] w-full flex-col bg-base-0">
        <header className="flex items-center justify-between border-b border-base-100 bg-base-0 px-5 py-2 text-sm">
          <Link
            href="/convert/local"
            onClick={() => setStarted(false)}
            className="inline-flex items-center gap-1.5 text-base-500 transition-colors hover:text-base-800"
          >
            <ArrowLeft size={13} weight="regular" />
            돌아가기
          </Link>
          <div className="flex items-center gap-3 text-xs text-base-400">
            <span>Brush · Apache 2.0 · 로컬 WebGPU</span>
            {useHosted && <span className="text-base-400">(공식 데모)</span>}
          </div>
        </header>
        <iframe
          src={src}
          className="h-full w-full flex-1 border-0"
          allow="clipboard-read; clipboard-write; fullscreen; xr-spatial-tracking"
          title="Brush WebGPU Trainer"
        />
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col gap-6 px-6 py-14 safe-top safe-bottom sm:px-10">
      <Link
        href="/convert"
        className="inline-flex items-center gap-1 text-xs text-base-500 transition-colors hover:text-base-800"
      >
        <ArrowLeft size={11} weight="regular" />
        서버 변환으로 돌아가기
      </Link>

      <header className="flex flex-col gap-2 animate-slide-up">
        <h1 className="text-2xl font-semibold tracking-tight text-base-900">
          내 PC로 직접 3D 만들기
        </h1>
        <p className="max-w-[55ch] text-sm text-base-500">
          서버 GPU 없이 브라우저 WebGPU 로 Gaussian Splat 을 직접 학습합니다. 여러 장의
          사진이 필요하며 (5-30장 권장), 학습 시간은 GPU 성능에 따라 5-30분.
        </p>
      </header>

      {/* WebGPU 지원 체크 */}
      {webgpuSupported === false && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.04] p-4 text-sm animate-fade-in">
          <Warning size={16} weight="regular" className="mt-0.5 flex-shrink-0 text-amber-500" />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              WebGPU 미지원 브라우저
            </p>
            <p className="text-xs text-base-500">
              Chrome 134+ 또는 Edge 134+ 로 접속해주세요. Firefox 는 아직 실험적.
            </p>
          </div>
        </div>
      )}

      {/* 소개 카드 */}
      <div className="flex flex-col gap-4 rounded-md border border-base-200 bg-base-50 p-6 animate-fade-in">
        <div className="flex items-center gap-2">
          <Cpu size={16} weight="regular" className="text-accent" />
          <h2 className="text-sm font-medium text-base-900">Brush — Rust + WebGPU 학습기</h2>
        </div>
        <ul className="flex flex-col gap-1.5 text-xs text-base-600">
          <li>• 서버 GPU 전혀 사용 안 함 → <b>완전 무료</b></li>
          <li>• 5~30장 사진 업로드 → 브라우저에서 Gaussian Splat 학습</li>
          <li>• .ply / .spz 포맷 다운로드</li>
          <li>• 학습 과정 실시간 시각화</li>
          <li>• 오픈소스 Apache 2.0</li>
        </ul>
        <div className="flex items-center gap-3 text-xs">
          <a
            href="https://github.com/ArthurBrussee/brush"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-base-500 transition-colors hover:text-base-800"
          >
            <GithubLogo size={12} weight="regular" />
            ArthurBrussee/brush
          </a>
          {useHosted && (
            <span className="text-base-400">
              (self-host 준비 중 — 지금은 공식 데모 사용)
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setStarted(true)}
        disabled={webgpuSupported === false}
        className="tactile mt-2 self-start rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright disabled:bg-base-200 disabled:text-base-500"
      >
        WebGPU 학습기 열기
      </button>
    </main>
  );
}
