/**
 * Typed environment accessors. Never import `process.env.*` directly from route
 * handlers — go through this module so missing vars surface at boot, and the
 * rest of the codebase gets non-optional strings.
 */

type RequiredEnvKey =
  | 'HF_SPACE_URL'
  | 'JOB_CALLBACK_SECRET'
  | 'R2_ACCOUNT_ID'
  | 'R2_ACCESS_KEY_ID'
  | 'R2_SECRET_ACCESS_KEY'
  | 'R2_BUCKET'
  | 'R2_PUBLIC_BASE';

type OptionalEnvKey =
  | 'HF_API_TOKEN'
  | 'MODAL_TOKEN_ID'
  | 'MODAL_TOKEN_SECRET'
  | 'REPLICATE_API_TOKEN'
  | 'UPSTASH_REDIS_REST_URL'
  | 'UPSTASH_REDIS_REST_TOKEN'
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'DATABASE_URL';

/**
 * 개발 모드(`NODE_ENV !== 'production'`)에서는 누락된 필수 환경변수를
 * placeholder로 대체해 앱이 정상 부팅되도록 한다. 프로덕션에서만 throw.
 */
const DEV_PLACEHOLDERS: Record<RequiredEnvKey, string> = {
  HF_SPACE_URL: 'http://localhost:7860',
  JOB_CALLBACK_SECRET: 'dev-secret-not-for-production-use-change-me',
  R2_ACCOUNT_ID: 'dev-account',
  R2_ACCESS_KEY_ID: 'dev-key',
  R2_SECRET_ACCESS_KEY: 'dev-secret',
  R2_BUCKET: 'splathub-dev',
  R2_PUBLIC_BASE: 'http://localhost:3000/samples',
};

export function required(key: RequiredEnvKey): string {
  const val = process.env[key];
  if (val) return val;
  if (process.env.NODE_ENV !== 'production') {
    return DEV_PLACEHOLDERS[key]!;
  }
  throw new Error(
    `Missing required env var: ${key}. See apps/web/.env.example for the full list.`,
  );
}

export function optional(key: OptionalEnvKey): string | undefined {
  return process.env[key] || undefined;
}

/** Convenience for the web app's publicly shareable origin. */
export function publicOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.VERCEL_URL ||
    process.env.CF_PAGES_URL ||
    'http://localhost:3000'
  );
}
