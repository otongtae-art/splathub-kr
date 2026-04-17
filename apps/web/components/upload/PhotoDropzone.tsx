'use client';

/**
 * PhotoDropzone — drag&drop 업로드 UI.
 *
 * 사용자 흐름:
 *   1. 사진 드롭 → 로컬 썸네일 즉시 표시
 *   2. [변환 시작] 클릭 → presigned PUT 발급 → 각 파일 PUT 업로드
 *   3. 모든 업로드 완료 → /api/jobs POST → 부모에 job_id 전달
 *
 * 서버 대역폭을 아끼기 위해 업로드는 브라우저 ↔ R2 직접. 실패한 파일은
 * 즉시 UI에 표기해서 부분 실패 상황도 명확하게 보여준다.
 */

import { useCallback, useMemo, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { INPUT_LIMITS } from '@splathub/shared';

type UploadItem = {
  id: string; // local key
  file: File;
  previewUrl: string;
  status: 'queued' | 'uploading' | 'done' | 'error';
  upload_id?: string; // server-assigned
  public_url?: string;
  error?: string;
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
        `${rejected.length}장은 형식·크기 제한으로 제외됐습니다. JPEG/PNG/HEIC, 장당 10MB 이하.`,
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
      // 1) presigned URL 발급
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          files: items.map((i) => ({
            name: i.file.name,
            size: i.file.size,
            mime: i.file.type,
          })),
        }),
      });
      if (!presignRes.ok) throw new Error(`presign_failed_${presignRes.status}`);
      const { uploads } = (await presignRes.json()) as {
        uploads: Array<{
          upload_id: string;
          url: string;
          headers: Record<string, string>;
          public_url: string;
        }>;
      };

      // 2) R2에 각 파일 직접 PUT
      await Promise.all(
        items.map(async (item, idx) => {
          const target = uploads[idx];
          if (!target) {
            throw new Error('presign_response_missing_target');
          }
          setItems((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading' } : p)),
          );
          const putRes = await fetch(target.url, {
            method: 'PUT',
            headers: target.headers,
            body: item.file,
          });
          if (!putRes.ok) {
            throw new Error(`upload_put_failed_${putRes.status}`);
          }
          setItems((prev) =>
            prev.map((p) =>
              p.id === item.id
                ? {
                    ...p,
                    status: 'done',
                    upload_id: target.upload_id,
                    public_url: target.public_url,
                  }
                : p,
            ),
          );
        }),
      );

      // 3) Job 생성
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
        const bodyText = await jobRes.text();
        throw new Error(`job_create_failed_${jobRes.status}_${bodyText.slice(0, 200)}`);
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
        className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
          isDragActive
            ? 'border-accent-500 bg-accent-500/5'
            : 'border-ink-700 bg-ink-800/40 hover:border-ink-500'
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-base font-medium text-ink-100">
          사진을 끌어다 놓거나 클릭해서 선택
        </p>
        <p className="mt-1 text-xs text-ink-400">
          JPEG · PNG · HEIC · 장당 10MB · 최대 {INPUT_LIMITS.MAX_IMAGES}장
        </p>
      </div>

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {items.map((i) => (
            <li
              key={i.id}
              className="relative aspect-square overflow-hidden rounded-lg border border-ink-700 bg-ink-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={i.previewUrl}
                alt={i.file.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeItem(i.id)}
                className="absolute right-1 top-1 rounded-full bg-ink-900/80 px-2 py-0.5 text-xs text-ink-100"
              >
                ×
              </button>
              <div className="absolute inset-x-0 bottom-0 bg-ink-900/70 px-2 py-1 text-[10px] uppercase tracking-wide text-ink-200">
                {i.status === 'queued' && '대기'}
                {i.status === 'uploading' && '업로드…'}
                {i.status === 'done' && '완료'}
                {i.status === 'error' && '실패'}
              </div>
            </li>
          ))}
        </ul>
      )}

      {globalError && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {globalError}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={items.length === 0 || submitting}
          className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? '업로드 중…' : '3D로 변환하기'}
        </button>
      </div>
    </div>
  );
}
