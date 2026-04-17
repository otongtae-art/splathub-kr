'use client';

/**
 * 브라우저용 Supabase 클라이언트 (싱글톤).
 * NEXT_PUBLIC_ 환경변수가 없으면 null → UI에서 "Supabase 미연결" 표시.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  if (!client) {
    client = createBrowserClient(url, key);
  }
  return client;
}

export function isSupabaseConnected(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
