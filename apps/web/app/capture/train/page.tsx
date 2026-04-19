'use client';

/**
 * `/capture/train` — 캡처된 사진들을 Brush WebGPU 학습기로 핸드오프.
 *
 * 흐름:
 *   1. /capture 에서 촬영된 File[] 을 window.__capturedShots 로 받음
 *   2. 사용자에게 옵션 제공:
 *      a) ZIP 으로 다운로드 + Brush 새 탭 (권장)
 *      b) 개별 다운로드
 *      c) 다시 촬영
 *   3. (a) 선택 → ZIP 자동 생성 + 다운로드 + Brush 열림
 *      → 사용자가 ZIP 을 Brush 에 드롭 → 학습 시작
 *
 * Brush 공식: https://splats.arthurbrussee.com/ (Apache 2.0)
 * 비용: $0 (브라우저 GPU).
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

type Meta = {
  count: number;
  sectorsCovered: number;
  timestamp: number;
};

const BRUSH_DEMO_URL = 'https://splats.arthurbrussee.com/';

export default function CaptureTrainPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [shots, setShots] = useState<File[] | null>(null);
  const [webgpuSupported, setWebgpuSupported] = useState<boolean | null>(null);
  const [started, setStarted] = useState(false);
  const thumbnailGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setWebgpuSupported(
        'gpu' in navigator && !!(navigator as Navigator & { gpu?: unknown }).gpu,
      );
    }
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

  // 썸네일 그리드 렌더링
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

  const downloadZip = async () => {
    if (!shots) return;
    // 간단한 ZIP 생성 (라이브러리 없이 store-only ZIP)
    // 구현 간소화: 사진이 이미 JPEG 로 압축됐으니 store mode ok
    const zipBlob = await createStoreOnlyZip(shots);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = `splathub-shots-${Date.now()}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const openBrush = async () => {
    setStarted(true);
    await downloadZip();
    window.open(BRUSH_DEMO_URL, '_blank', 'noopener,noreferrer');
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
          촬영한 사진들을 Brush WebGPU 학습기로 보내 실제 3D 를 재구성합니다.
          서버 GPU 비용 0원, 사용자 기기 GPU 만 사용합니다.
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
              Chrome 134+ 또는 Edge 134+ 에서 접속해주세요.
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
            1. <b>&quot;Brush 학습 시작&quot;</b> 버튼 클릭 → 사진들이 ZIP 으로 자동
            다운로드됩니다.
          </li>
          <li>2. 새 탭에서 Brush 학습기가 열립니다.</li>
          <li>
            3. 다운로드된 <b>ZIP 파일을 Brush 창 중앙에 드롭</b>하세요.
          </li>
          <li>4. 학습 진행 (5~15분) — 3D 가 실시간으로 만들어지는 걸 볼 수 있습니다.</li>
          <li>5. 완료되면 Brush 에서 .ply 로 저장 가능.</li>
        </ol>
        <button
          type="button"
          onClick={openBrush}
          disabled={webgpuSupported === false}
          className="tactile mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright disabled:bg-base-200 disabled:text-base-500"
        >
          <PlayCircle size={16} weight="regular" />
          Brush 학습 시작 (ZIP 다운로드 + 새 탭)
        </button>
      </section>

      {started && (
        <section className="flex items-start gap-2 rounded-md border border-accent/30 bg-accent/[0.04] p-4 text-sm animate-fade-in">
          <CheckCircle
            size={16}
            weight="regular"
            className="mt-0.5 flex-shrink-0 text-accent"
          />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-accent">ZIP 다운로드 + Brush 열림</p>
            <p className="text-xs text-base-500">
              다운로드된 ZIP 파일을 Brush 창에 드래그하세요. 학습 중에는 이 탭을 닫아도
              됩니다.
            </p>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs animate-fade-in">
        <button
          type="button"
          onClick={downloadZip}
          className="inline-flex items-center gap-1 text-base-500 transition-colors hover:text-base-800"
        >
          <DownloadSimple size={12} weight="regular" />
          ZIP 만 다운로드
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

      <section className="mt-4 flex flex-col gap-2 rounded-md border border-dashed border-base-200 p-5 text-xs leading-relaxed text-base-500">
        <p className="font-medium text-base-700">왜 브라우저 GPU?</p>
        <p>
          이 방식은 삼성 3D Scanner / 애플 Object Capture 와 동일한
          photogrammetry 원리입니다. 단지 우리는 LiDAR 없이 사진의 여러 각도로 기하를
          계산합니다. 서버 GPU 를 쓰지 않으므로 비용이 발생하지 않고, 결과는 실제 측정
          기반이라 AI 환각이 없습니다.
        </p>
        <p>
          빠른 프리뷰가 필요하면{' '}
          <Link
            href="/convert"
            className="underline transition-colors hover:text-base-800"
          >
            빠른 프리뷰 모드 (TRELLIS)
          </Link>{' '}
          를 사용하세요 (30~60초).
        </p>
      </section>
    </main>
  );
}

/**
 * 의존성 없이 간단한 store-only ZIP 생성.
 * 사진은 이미 JPEG 압축이 돼있어 추가 압축 불필요.
 * ZIP 포맷: https://en.wikipedia.org/wiki/ZIP_(file_format)
 */
async function createStoreOnlyZip(files: File[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const centralRecords: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = new Uint8Array(await file.arrayBuffer());
    const crc = crc32(data);

    // Local file header
    const local = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(local);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // compression = store
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0, true); // mod date
    lv.setUint32(14, crc, true); // CRC
    lv.setUint32(18, data.length, true); // compressed size
    lv.setUint32(22, data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true); // name length
    lv.setUint16(28, 0, true); // extra length
    const localArr = new Uint8Array(local);
    localArr.set(nameBytes, 30);

    parts.push(localArr);
    parts.push(data);

    // Central directory record
    const central = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(central);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true); // flags
    cv.setUint16(10, 0, true); // compression
    cv.setUint16(12, 0, true); // mod time
    cv.setUint16(14, 0, true); // mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk
    cv.setUint16(36, 0, true); // internal attr
    cv.setUint32(38, 0, true); // external attr
    cv.setUint32(42, offset, true); // local header offset
    const centralArr = new Uint8Array(central);
    centralArr.set(nameBytes, 46);
    centralRecords.push(centralArr);

    offset += localArr.length + data.length;
  }

  // End of central directory record
  const centralSize = centralRecords.reduce((s, r) => s + r.length, 0);
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true); // signature
  ev.setUint16(4, 0, true); // disk
  ev.setUint16(6, 0, true); // disk with central
  ev.setUint16(8, files.length, true); // entries on disk
  ev.setUint16(10, files.length, true); // total entries
  ev.setUint32(12, centralSize, true); // central size
  ev.setUint32(16, offset, true); // central offset
  ev.setUint16(20, 0, true); // comment length

  const out: BlobPart[] = [
    ...parts,
    ...centralRecords.map((r) => r as BlobPart),
    new Uint8Array(eocd) as BlobPart,
  ];
  return new Blob(out, { type: 'application/zip' });
}

// CRC32 구현 — IEEE 802.3 polynomial, 표준 ZIP 에서 사용.
function crc32(data: Uint8Array): number {
  let c: number;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  let crc = 0 ^ -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]!) & 0xff]!;
  }
  return (crc ^ -1) >>> 0;
}
