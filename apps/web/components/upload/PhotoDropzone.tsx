'use client';

/**
 * PhotoDropzone — 드래그앤드롭 업로드 UI.
 * taste-skill 원칙 적용: 이모지 제거, accent glow 제거, tactile feedback.
 */

import { useCallback, useMemo, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { UploadSimple, X, Check, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { INPUT_LIMITS } from '@/lib/shared';

type UploadItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: 'queued' | 'uploading' | 'done' | 'error';
  upload_id?: string;
  public_url?: string;
};

type Props = {
  onJobCreated: (jobId: string) => void;
};

export default function PhotoDropzone({ onJobCreated }: Props) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const accept = useMemo(
    () =>
      Object.fromEntries(
        INPUT_LIMITS.ALLOWED_IMAGE_MIMES.map((m) => [m, [] as string[]]),
      ),
    [],
  );

  const onDrop = useCallback((accepted: File[], rejected: FileRejection[]) => {
    setGlobalError(null);
    if (rejected.length > 0) {
      setGlobalError(
        `${rejected.length}장은 제외됐습니다. JPEG·PNG·HEIC, 장당 10MB 이하.`,
      );
    }
    setItems((prev) => {
      const next = [...prev];
      for (const f of accepted) {
        if (next.length >= INPUT_LIMITS.MAX_IMAGES) break;
        next.push({
          id: `${f.name}-${f.size}-${f.lastModified}`,
          file: f,
          previewUrl: URL.createObjectURL(f),
          status: 'queued',
        });
      }
      return next;
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize: INPUT_LIMITS.MAX_IMAGE_BYTES,
    maxFiles: INPUT_LIMITS.MAX_IMAGES,
    multiple: true,
  });

  const removeItem = (id: string) => {
    setItems((prev) => {
      const removed = prev.find((i) => i.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const submit = useCallback(async () => {
    if (items.length === 0 || submitting) return;
    setSubmitting(true);
    setGlobalError(null);

    try {
      setItems((prev) => prev.map((p) => ({ ...p, status: 'uploading' as const })));

      const formData = new FormData();
      items.forEach((item) => formData.append('files', item.file));

      const uploadRes = await fetch('/api/upload/file', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) throw new Error(`upload_failed_${uploadRes.status}`);

      const { uploads } = (await uploadRes.json()) as {
        uploads: Array<{ upload_id: string; public_url: string; filename: string }>;
      };

      setItems((prev) =>
        prev.map((p, idx) => ({
          ...p,
          status: 'done' as const,
          upload_id: uploads[idx]?.upload_id,
          public_url: uploads[idx]?.public_url,
        })),
      );

      const upload_ids = uploads.map((u) => u.upload_id);
      const jobRes = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          upload_ids,
          kind: 'photo_to_splat',
          source: 'upload',
          quality: 'fast',
        }),
      });

      if (!jobRes.ok) {
        throw new Error(`job_create_failed_${jobRes.status}`);
      }
      const { job_id } = (await jobRes.json()) as { job_id: string };
      onJobCreated(job_id);
    } catch (err) {
      setGlobalError((err as Error).message);
      setItems((prev) =>
        prev.map((p) => (p.status === 'uploading' ? { ...p, status: 'error' } : p)),
      );
    } finally {
      setSubmitting(false);
    }
  }, [items, submitting, onJobCreated]);

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps()}
        className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
          isDragActive
            ? 'border-accent bg-accent/[0.04]'
            : 'border-base-200 bg-base-50 hover:border-base-300'
        }`}
      >
        <input {...getInputProps()} />
        <UploadSimple
          size={24}
          weight="regular"
          className="text-base-500"
        />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-base-800">
            사진을 끌어다 놓거나 클릭해서 선택
          </p>
          <p className="text-xs text-base-500">
            JPEG · PNG · HEIC · 장당 10MB · 최대 {INPUT_LIMITS.MAX_IMAGES}장
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {items.map((i, idx) => (
            <li
              key={i.id}
              className={`group relative aspect-square overflow-hidden rounded-md border border-base-200 bg-base-100 animate-scale-in stagger-${Math.min(idx + 1, 5)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={i.previewUrl}
                alt={i.file.name}
                className="h-full w-full object-cover"
              />
              {!submitting && (
                <button
                  type="button"
                  onClick={() => removeItem(i.id)}
                  aria-label="삭제"
                  className="tactile absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-base-0/80 text-base-600 opacity-0 backdrop-blur transition-opacity hover:text-base-900 group-hover:opacity-100"
                >
                  <X size={11} weight="bold" />
                </button>
              )}
              <StatusBadge status={i.status} />
            </li>
          ))}
        </ul>
      )}

      {globalError && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/[0.04] px-3 py-2.5 text-sm text-danger">
          <WarningCircle size={14} weight="regular" className="mt-0.5 flex-shrink-0" />
          <span>{globalError}</span>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-base-100 pt-4">
        {items.length > 0 && !submitting ? (
          <button
            type="button"
            onClick={() => setItems([])}
            className="text-xs text-base-500 transition-colors hover:text-base-800"
          >
            전체 삭제
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={submit}
          disabled={items.length === 0 || submitting}
          className="tactile inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-500"
        >
          {submitting ? '업로드 중' : `3D로 변환 · ${items.length}`}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: UploadItem['status'] }) {
  if (status === 'queued') return null;
  const config = {
    uploading: { text: '업로드', color: 'bg-base-0/80 text-base-300' },
    done: { text: null, color: 'bg-accent/90 text-base-0', icon: <Check size={11} weight="bold" /> },
    error: { text: '실패', color: 'bg-danger/90 text-base-0' },
  }[status];

  return (
    <div
      className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wide backdrop-blur ${config.color}`}
    >
      {'icon' in config && config.icon}
      {config.text}
    </div>
  );
}
