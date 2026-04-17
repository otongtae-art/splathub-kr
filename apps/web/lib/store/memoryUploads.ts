/**
 * In-memory upload registry — M1 only.
 *
 * Records the presigned uploads we've issued so /api/jobs can validate that
 * referenced upload_ids really exist before dispatching to a GPU worker.
 * M2 replaces this with a Supabase `uploads` table.
 */

import { randomUUID } from 'crypto';
import type { Upload } from '@/lib/shared/types';

const store = new Map<string, Upload>();

export function registerUpload(init: Omit<Upload, 'id' | 'uploaded_at'>): Upload {
  const record: Upload = {
    ...init,
    id: randomUUID(),
    uploaded_at: new Date().toISOString(),
  };
  store.set(record.id, record);
  return record;
}

export function getUpload(id: string): Upload | undefined {
  return store.get(id);
}

export function getUploads(ids: string[]): Upload[] {
  return ids.map((id) => store.get(id)).filter((u): u is Upload => Boolean(u));
}
