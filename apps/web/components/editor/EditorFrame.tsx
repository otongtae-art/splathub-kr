'use client';

/**
 * EditorFrame — SuperSplat iframe 래퍼.
 *
 * SuperSplat (playcanvas/supersplat, MIT, v2.24.5) 을 iframe 에 임베드.
 * 편집기 빌드가 아직 없으면 공식 호스티드 URL (https://playcanvas.com/supersplat/editor)
 * 로 fallback — 사용자 경험 끊김 없게.
 */

import { ArrowLeft, DownloadSimple } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Props = {
  modelId: string;
  loadUrl: string | null;
};

// self-host 한 에디터 빌드. scripts/build-editor.sh 가 생성.
const LOCAL_EDITOR_PATH = '/editor-app/index.html';
// 공식 호스티드 fallback (MIT, 라이선스 표기 유지).
const HOSTED_EDITOR_URL = 'https://playcanvas.com/supersplat/editor';

export default function EditorFrame({ modelId, loadUrl }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [useHosted, setUseHosted] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // 로컬 빌드 존재 여부 확인 (404 면 hosted 로 fallback)
  useEffect(() => {
    fetch(LOCAL_EDITOR_PATH, { method: 'HEAD' })
      .then((res) => {
        if (!res.ok) setUseHosted(true);
      })
      .catch(() => setUseHosted(true));
  }, []);

  // postMessage 브리지
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // origin 체크
      if (event.origin !== window.location.origin && !useHosted) return;

      const data = event.data as
        | { type: 'supersplat:ready' }
        | { type: 'supersplat:save'; format: string; bytes: ArrayBuffer };

      if (!data || typeof data !== 'object') return;

      if (data.type === 'supersplat:ready') {
        // 에디터가 준비됐으면 loadUrl 을 넘겨줌
        if (loadUrl && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            { type: 'splathub:init', loadUrl, modelId },
            '*',
          );
        }
      } else if (data.type === 'supersplat:save') {
        // 편집된 .ply/.spz 를 받아 업로드 (Phase 2: DB save)
        console.info('[editor] save received', data.format, data.bytes.byteLength);
        setSaved(`${data.format} · ${(data.bytes.byteLength / 1024).toFixed(1)} KB`);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadUrl, modelId, useHosted]);

  const src = useHosted
    ? loadUrl
      ? `${HOSTED_EDITOR_URL}?load=${encodeURIComponent(loadUrl)}`
      : HOSTED_EDITOR_URL
    : loadUrl
      ? `${LOCAL_EDITOR_PATH}?load=${encodeURIComponent(loadUrl)}`
      : LOCAL_EDITOR_PATH;

  return (
    <>
      {/* 상단 얇은 바 — 뒤로가기 + 상태 */}
      <header className="flex items-center justify-between border-b border-base-100 bg-base-0 px-5 py-2 text-sm">
        <Link
          href={`/m/${modelId}`}
          className="inline-flex items-center gap-1.5 text-base-500 transition-colors hover:text-base-800"
        >
          <ArrowLeft size={13} weight="regular" />
          돌아가기
        </Link>
        <div className="flex items-center gap-3 text-xs text-base-500">
          {useHosted && (
            <span className="text-base-400">
              공식 에디터 호스트 사용 (self-host 준비 중)
            </span>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 text-accent">
              <DownloadSimple size={12} weight="regular" />
              저장 완료 · {saved}
            </span>
          )}
        </div>
      </header>
      <iframe
        ref={iframeRef}
        src={src}
        className="h-full w-full flex-1 border-0"
        allow="clipboard-read; clipboard-write; fullscreen"
        title="SuperSplat Editor"
      />
    </>
  );
}
