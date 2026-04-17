/**
 * 서버용 Supabase 클라이언트 (API Routes / Server Components).
 * service_role 키를 사용하면 RLS를 우회할 수 있으므로 주의.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 현재 사용자 세션 기반 클라이언트 (RLS 적용).
 */
export async function getSupabaseServer(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component에서 호출 시 쿠키 설정 불가 — 무시
        }
      },
    },
  });
}

/**
 * Service Role 클라이언트 (RLS 우회, 관리자 작업용).
 */
export async function getSupabaseAdmin(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  // Dynamic import 대신 직접 생성
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, serviceKey);
}
