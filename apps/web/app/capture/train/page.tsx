'use client';

/**
 * `/capture/train` — 캡처된 사진들로 VGGT photogrammetry 학습.
 *
 * VGGT (Meta, CVPR 2025 Best Paper) 가 우리 HF Space wrapper 를 통해 실행됨.
 * 서버 GPU 비용 $0 (ZeroGPU 무료 티어), 사용자는 브라우저 안에서 바로 결과 확인.
 *
 * 흐름:
 *   1. /capture 에서 촬영된 File[] 을 window.__capturedShots 로 받음
 *   2. "3D 학습 시작" 버튼 → VGGT 호출 (~30~60초)
 *   3. 반환된 .glb 를 MeshViewer 에 바로 표시
 *   4. (선택) Brush WebGPU 로 로컬 학습도 가능
 */

import {
  ArrowLeft,
  CheckCircle,
  Cpu,
  DownloadSimple,
  PlayCircle,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { callVggt } from '@/lib/hfSpace';

const MeshViewer = dynamic(() => import('@/components/viewer/MeshViewer'), {
  ssr: false,
});

type Meta = {
  count: number;
  sectorsCovered: number;
  timestamp: number;
};

type Stage = 'ready' | 'training' | 'done' | 'error';

const BRUSH_DEMO_URL = 'https://splats.arthurbrussee.com/';

export default function CaptureTrainPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [shots, setShots] = useState<File[] | null>(null);
  const [stage, setStage] = useState<Stage>('ready');
  const [progress, setProgress] = useState<{ frac: number; label: string }>({
    frac: 0,
    label: '',
  });
  const [glbBytes, setGlbBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thumbnailGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('splathub:captured-meta');
      if (raw) setMeta(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    const files = (window as Window & { __capturedShots?: File[] })
      .__capturedShots;
    if (files && files.length > 0) setShots(files);
  }, []);

  useEffect(() => {
    if (!shots || !thumbnailGridRef.current) return;
    const container = thumbnailGridRef.current;
    container.innerHTML = '';
    shots.forEach((f) => {
      const url = URL.createObjectURL(f);
      const img = document.createElement('img');
      img.src = url;
      img.className = 'aspect-square w-full object-cover rounded';
      img.onload = () => URL.revokeObjectURL(url);
      container.appendChild(img);
    });
  }, [shots]);

  const startTraining = async () => {
    if (!shots || shots.length < 2) return;
    setStage('training');
    setError(null);
    setProgress({ frac: 0, label: '초기화' });
    try {
      const result = await callVggt(shots, {
        onProgress: (frac, label) => {
          setProgress({ frac, label: label ?? '' });
        },
      });
      setGlbBytes(result.bytes);
      setStage('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[train] VGGT failed', err);
      setError(msg);
      setStage('error');
    }
  };

  const downloadGlb = () => {
    if (!glbBytes) return;
    const blob = new Blob([glbBytes as BlobPart], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `splathub-3d-${Date.now()}.glb`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (!shots) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <Warning size={36} weight="regular" className="text-amber-500" />
        <h1 className="text-xl font-semibold text-base-900">
          촬영 데이터를 찾을 수 없습니다
        </h1>
        <p className="text-sm text-base-500">
          브라우저를 새로고침하면 사진이 사라집니다. 다시 촬영해주세요.
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

  // 결과 표시 모드
  if (stage === 'done' && glbBytes) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <header className="flex items-center justify-between border-b border-base-100 bg-base-0 px-5 py-2 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-base-500 transition-colors hover:text-base-800"
          >
            <ArrowLeft size={13} weight="regular" />
            홈으로
          </Link>
          <div className="flex items-center gap-3 text-xs text-base-500">
            <span>VGGT · photogrammetry · {shots.length}장</span>
            <button
              type="button"
              onClick={downloadGlb}
              className="inline-flex items-center gap-1 text-base-700 transition-colors hover:text-base-900"
            >
              <DownloadSimple size={12} weight="regular" />
              .glb 다운로드
            </button>
          </div>
        </header>
        <div className="flex-1">
          <MeshViewer fileBytes={glbBytes} autoRotate />
        </div>
      </div>
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
          촬영한 사진들을 Meta VGGT (CVPR 2025 Best Paper) 로 실제 3D 재구성.
          AI 환각이 아닌 <b>실측 기반 photogrammetry</b>. 서버 비용 $0.
        </p>
      </header>

      {/* 메타 */}
      <section className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-base-500 animate-fade-in">
        <span>📸 사진 {shots.length}장</span>
        {meta && <span>📐 각도 {meta.sectorsCovered}/12구간</span>}
        <span>
          💾 {(shots.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(2)} MB
        </span>
      </section>

      {/* 썸네일 그리드 */}
      <section className="animate-fade-in">
        <div
          ref={thumbnailGridRef}
          className="grid grid-cols-5 gap-1 sm:grid-cols-8"
        />
      </section>

      {/* 메인 액션 */}
      {stage === 'ready' && (
        <section className="flex flex-col gap-4 rounded-md border border-base-200 bg-base-50 p-6 animate-fade-in">
          <div className="flex items-center gap-2">
            <Cpu size={16} weight="regular" className="text-accent" />
            <h2 className="text-sm font-medium text-base-900">
              Meta VGGT · Visual Geometry Grounded Transformer
            </h2>
          </div>
          <ul className="flex flex-col gap-1.5 text-xs text-base-600">
            <li>• <b>CVPR 2025 Best Paper Award</b> — 현재 SOTA photogrammetry</li>
            <li>• 실측 기반 (pose + depth 를 동시에 추정) — AI 환각 없음</li>
            <li>• 예상 소요: {shots.length}장 기준 약 {Math.max(20, shots.length * 2)}~{shots.length * 3}초</li>
            <li>• 비용: $0 (Meta 공식 HF Space, ZeroGPU 무료 티어)</li>
          </ul>
          <button
            type="button"
            onClick={startTraining}
            disabled={shots.length < 2}
            className="tactile mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright disabled:bg-base-200 disabled:text-base-500"
          >
            <PlayCircle size={16} weight="regular" />
            3D 학습 시작
          </button>
        </section>
      )}

      {/* 학습 중 */}
      {stage === 'training' && (
        <section className="flex flex-col gap-3 rounded-md border border-accent/30 bg-accent/[0.04] p-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-base-900">학습 진행 중</span>
            <span className="font-mono text-xs text-base-500">
              {Math.round(progress.frac * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-100">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${progress.frac * 100}%` }}
            />
          </div>
          <p className="text-xs text-base-500">{progress.label}</p>
        </section>
      )}

      {/* 에러 */}
      {stage === 'error' && (
        <section className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/[0.04] p-5 animate-fade-in">
          <div className="flex items-center gap-2">
            <Warning size={16} weight="regular" className="text-danger" />
            <h2 className="text-sm font-medium text-danger">학습 실패</h2>
          </div>
          <p className="text-xs text-base-500 break-all">{error}</p>
          <button
            type="button"
            onClick={() => {
              setStage('ready');
              setError(null);
            }}
            className="tactile self-start rounded-md border border-base-200 bg-base-50 px-3 py-1.5 text-sm text-base-700"
          >
            다시 시도
          </button>
        </section>
      )}

      {/* 고급: Brush WebGPU 로 로컬 학습 (옵션) */}
      {stage === 'ready' && (
        <section className="flex flex-col gap-3 rounded-md border border-dashed border-base-200 p-5 text-xs text-base-500 animate-fade-in">
          <p className="font-medium text-base-700">고급: 완전 오프라인 학습</p>
          <p>
            GPU 가 좋다면 Brush (Apache 2.0) 로 브라우저에서 직접 학습 가능.
            VGGT 보다 오래 걸리지만 (5~15분) 결과 품질이 더 높을 수 있음.
          </p>
          <a
            href={BRUSH_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-base-700 underline transition-colors hover:text-base-900"
          >
            Brush 데모 열기 →
          </a>
        </section>
      )}
    </main>
  );
}
