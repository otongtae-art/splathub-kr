'use client';

/**
 * `/capture/train` — 녹화된 동영상을 Brush WebGPU 학습기로 핸드오프.
 *
 * 흐름:
 *   1. /capture 에서 녹화된 Blob 을 window.__capturedVideoBlob 으로 전달받음
 *   2. 사용자에게 3가지 옵션 제공:
 *      a) Brush 에 동영상 드롭해서 학습 (권장)
 *      b) 동영상만 다운로드 (나중에 직접 학습)
 *      c) 다시 녹화
 *   3. (a) 선택 시: Brush iframe 열고 blob URL 안내
 *
 * Brush 공식 데모: https://splats.arthurbrussee.com/
 *   - MP4/WebM 동영상 또는 이미지 폴더 드롭 지원
 *   - WebGPU 로 브라우저 내에서 Gaussian Splat 학습
 *   - Apache 2.0
 *
 * 비용: $0. 서버 GPU 전혀 안 씀.
 */

import {
  ArrowLeft,
  CheckCircle,
  Cpu,
  DownloadSimple,
  PlayCircle,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type VideoMeta = {
  url: string;
  mime: string;
  size: number;
  duration: number;
  sectors: number;
  timestamp: number;
};

const BRUSH_DEMO_URL = 'https://splats.arthurbrussee.com/';

export default function CaptureTrainPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [blobMissing, setBlobMissing] = useState(false);
  const [started, setStarted] = useState(false);
  const [webgpuSupported, setWebgpuSupported] = useState<boolean | null>(null);

  useEffect(() => {
    // WebGPU 감지
    if (typeof navigator !== 'undefined') {
      setWebgpuSupported(
        'gpu' in navigator && !!(navigator as Navigator & { gpu?: unknown }).gpu,
      );
    }

    // sessionStorage 에서 녹화 메타 복원
    try {
      const raw = sessionStorage.getItem('splathub:captured-video');
      if (!raw) {
        setBlobMissing(true);
        return;
      }
      const parsed = JSON.parse(raw) as VideoMeta;
      setMeta(parsed);

      // Blob 이 window 에 있는지 확인 (페이지 리로드 시 유실됨)
      const blob = (window as Window & { __capturedVideoBlob?: Blob })
        .__capturedVideoBlob;
      if (!blob) {
        setBlobMissing(true);
      }
    } catch {
      setBlobMissing(true);
    }
  }, []);

  // 동영상 미리보기
  useEffect(() => {
    if (!meta || !videoRef.current) return;
    videoRef.current.src = meta.url;
  }, [meta]);

  const downloadVideo = () => {
    const blob = (window as Window & { __capturedVideoBlob?: Blob })
      .__capturedVideoBlob;
    if (!blob || !meta) return;
    const a = document.createElement('a');
    a.href = meta.url;
    const ext = meta.mime.includes('mp4') ? 'mp4' : 'webm';
    a.download = `splathub-capture-${Date.now()}.${ext}`;
    a.click();
  };

  const openBrushTrainer = () => {
    setStarted(true);
    // 사용자에게 먼저 동영상 다운로드를 권장 (Brush 에 드롭하려면 파일 필요)
    downloadVideo();
    // 새 탭에서 Brush 열기
    window.open(BRUSH_DEMO_URL, '_blank', 'noopener,noreferrer');
  };

  if (blobMissing) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <Warning size={36} weight="regular" className="text-amber-500" />
        <h1 className="text-xl font-semibold text-base-900">
          녹화 데이터를 찾을 수 없습니다
        </h1>
        <p className="text-sm text-base-500">
          브라우저를 새로고침하면 녹화 파일이 사라집니다. 다시 촬영해주세요.
        </p>
        <Link
          href="/capture"
          className="tactile mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-base-0"
        >
          다시 촬영하기
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col gap-6 px-6 py-10 safe-top safe-bottom sm:px-10">
      <Link
        href="/capture"
        className="inline-flex items-center gap-1 text-xs text-base-500 transition-colors hover:text-base-800"
      >
        <ArrowLeft size={11} weight="regular" />
        촬영으로 돌아가기
      </Link>

      <header className="flex flex-col gap-2 animate-slide-up">
        <h1 className="text-2xl font-semibold tracking-tight text-base-900">
          3D 학습 준비 완료
        </h1>
        <p className="max-w-[55ch] text-sm text-base-500">
          녹화된 동영상으로 브라우저에서 직접 Gaussian Splat 을 학습합니다. 서버 GPU 비용
          전혀 없이 당신의 기기로만 연산합니다.
        </p>
      </header>

      {/* 녹화 프리뷰 */}
      {meta && (
        <section className="flex flex-col gap-3 animate-fade-in">
          <div className="overflow-hidden rounded-md border border-base-200 bg-black">
            <video
              ref={videoRef}
              controls
              playsInline
              className="aspect-video w-full"
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-base-500">
            <span>⏱ {meta.duration.toFixed(1)}초</span>
            <span>📐 각도 {meta.sectors}/12구간</span>
            <span>💾 {(meta.size / 1024 / 1024).toFixed(2)} MB</span>
            <span>🎬 {meta.mime.split(';')[0]}</span>
          </div>
        </section>
      )}

      {/* WebGPU 미지원 경고 */}
      {webgpuSupported === false && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.04] p-4 text-sm animate-fade-in">
          <Warning
            size={16}
            weight="regular"
            className="mt-0.5 flex-shrink-0 text-amber-500"
          />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              WebGPU 미지원 브라우저
            </p>
            <p className="text-xs text-base-500">
              Chrome 134+ 또는 Edge 134+ 에서 접속해주세요. 현재 브라우저에서는
              Brush 학습기가 정상 작동하지 않을 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* 액션 카드 */}
      <section className="flex flex-col gap-4 rounded-md border border-base-200 bg-base-50 p-6 animate-fade-in">
        <div className="flex items-center gap-2">
          <Cpu size={16} weight="regular" className="text-accent" />
          <h2 className="text-sm font-medium text-base-900">
            Brush (Apache 2.0) · WebGPU Photogrammetry
          </h2>
        </div>
        <ol className="flex flex-col gap-2 text-xs leading-relaxed text-base-600">
          <li>
            1. 아래 <b>&quot;Brush 학습 시작&quot;</b> 버튼을 누르면 동영상이 자동 다운로드됩니다.
          </li>
          <li>2. 새 탭에서 Brush 학습기가 열립니다.</li>
          <li>
            3. 다운로드된 동영상 파일을 <b>Brush 창 중앙에 드롭</b>하세요.
          </li>
          <li>4. 학습 진행 (5~15분) — 실시간으로 3D 가 만들어지는 걸 볼 수 있습니다.</li>
          <li>5. 완료되면 Brush 에서 .ply 로 저장 → SplatHub 에 업로드 가능.</li>
        </ol>
        <button
          type="button"
          onClick={openBrushTrainer}
          disabled={!meta || webgpuSupported === false}
          className="tactile mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright disabled:bg-base-200 disabled:text-base-500"
        >
          <PlayCircle size={16} weight="regular" />
          Brush 학습 시작 (동영상 다운로드 + 새 탭)
        </button>
      </section>

      {/* 성공 시나리오 안내 */}
      {started && (
        <section className="flex items-start gap-2 rounded-md border border-accent/30 bg-accent/[0.04] p-4 text-sm animate-fade-in">
          <CheckCircle
            size={16}
            weight="regular"
            className="mt-0.5 flex-shrink-0 text-accent"
          />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-accent">동영상 다운로드 + Brush 열림</p>
            <p className="text-xs text-base-500">
              다운로드된 파일을 Brush 창에 드래그하세요. 학습 중에는 이 탭을 닫아도
              됩니다. Brush 가 .ply 파일을 만들면 SplatHub 메인으로 돌아와 업로드하세요.
            </p>
          </div>
        </section>
      )}

      {/* 보조 액션 */}
      <div className="flex flex-wrap items-center gap-3 text-xs animate-fade-in">
        <button
          type="button"
          onClick={downloadVideo}
          className="inline-flex items-center gap-1 text-base-500 transition-colors hover:text-base-800"
        >
          <DownloadSimple size={12} weight="regular" />
          동영상만 다운로드
        </button>
        <span className="text-base-300">·</span>
        <Link
          href="/capture"
          className="text-base-500 transition-colors hover:text-base-800"
        >
          다시 촬영
        </Link>
        <span className="text-base-300">·</span>
        <a
          href="https://github.com/ArthurBrussee/brush"
          target="_blank"
          rel="noopener noreferrer"
          className="text-base-500 transition-colors hover:text-base-800"
        >
          Brush 정보 →
        </a>
      </div>

      {/* 왜 이 방식인가 */}
      <section className="mt-4 flex flex-col gap-2 rounded-md border border-dashed border-base-200 p-5 text-xs leading-relaxed text-base-500">
        <p className="font-medium text-base-700">왜 서버 GPU 가 아닌 브라우저 GPU?</p>
        <p>
          이 방식은 삼성 3D Scanner / 애플 Object Capture 와 동일한 원리
          (photogrammetry) 를 사용합니다. 단, 우리는 LiDAR 가 없으니 동영상의 여러
          각도로 기하학을 계산합니다. 서버 GPU 를 쓰지 않으므로 비용이 발생하지 않고,
          결과물은 실제 측정 기반이라 AI 환각이 없습니다.
        </p>
        <p>
          대신 학습이 5~15분 걸립니다. 빠른 프리뷰가 필요하면 <Link
            href="/convert"
            className="underline transition-colors hover:text-base-800"
          >빠른 프리뷰 모드 (TRELLIS)</Link> 를 사용하세요.
        </p>
      </section>
    </main>
  );
}
