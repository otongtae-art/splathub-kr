'use client';

import Link from 'next/link';
import { useState } from 'react';
import { GoogleLogo, ArrowRight, Warning } from '@phosphor-icons/react/dist/ssr';
import { getSupabaseBrowser, isSupabaseConnected } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = isSupabaseConnected();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === 'signup') {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (err) setError(err.message);
      else setMessage('가입 확인 이메일을 보냈습니다. 메일함을 확인해주세요.');
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) setError(err.message);
      else window.location.href = '/';
    }

    setLoading(false);
  };

  const handleOAuth = async (provider: 'google' | 'kakao') => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    });
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6">
      <div className="w-full max-w-sm animate-slide-up">
        <header className="mb-10 flex flex-col items-start gap-1.5">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-base-900"
          >
            SplatHub
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-base-900">
            {mode === 'login' ? '다시 만나서 반가워요' : '계정 만들기'}
          </h1>
          <p className="text-sm text-base-500">
            {mode === 'login'
              ? '이메일 또는 소셜 계정으로 계속하세요.'
              : '가입하고 3D 모델을 저장하세요.'}
          </p>
        </header>

        {!connected && (
          <div className="mb-6 flex flex-col gap-3 rounded-lg border border-warn/30 bg-warn/[0.04] p-4">
            <div className="flex items-start gap-2">
              <Warning size={14} weight="regular" className="mt-0.5 flex-shrink-0 text-warn" />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-warn">Supabase 미연결</p>
                <p className="text-xs text-base-500">
                  .env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를
                  설정하면 로그인이 활성화됩니다.
                </p>
              </div>
            </div>
            <Link
              href="/"
              className="tactile inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base-0"
            >
              게스트로 시작하기
              <ArrowRight size={12} weight="bold" />
            </Link>
          </div>
        )}

        {connected && (
          <>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleOAuth('google')}
                className="tactile inline-flex items-center justify-center gap-2 rounded-md border border-base-200 bg-base-50 py-2.5 text-sm font-medium text-base-800 transition-colors hover:border-base-300"
              >
                <GoogleLogo size={16} weight="bold" />
                Google로 계속
              </button>
              <button
                type="button"
                onClick={() => handleOAuth('kakao')}
                className="tactile inline-flex items-center justify-center gap-2 rounded-md bg-[#FEE500] py-2.5 text-sm font-medium text-[#191919] transition-colors hover:bg-[#FDD835]"
              >
                카카오로 계속
              </button>
            </div>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-base-100" />
              <span className="text-xs text-base-500">또는</span>
              <div className="h-px flex-1 bg-base-100" />
            </div>

            <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-xs font-medium text-base-600">
                  이메일
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="rounded-md border border-base-200 bg-base-50 px-3 py-2 text-sm text-base-900 placeholder:text-base-400 focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-xs font-medium text-base-600">
                  비밀번호
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="최소 6자"
                  required
                  minLength={6}
                  className="rounded-md border border-base-200 bg-base-50 px-3 py-2 text-sm text-base-900 placeholder:text-base-400 focus:border-accent focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="tactile mt-1 rounded-md bg-accent py-2.5 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright disabled:bg-base-200 disabled:text-base-500"
              >
                {loading ? '처리 중' : mode === 'login' ? '로그인' : '회원가입'}
              </button>
            </form>

            {error && (
              <p className="mt-3 rounded-md border border-danger/30 bg-danger/[0.04] px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
            {message && (
              <p className="mt-3 rounded-md border border-accent/30 bg-accent/[0.04] px-3 py-2 text-xs text-accent-bright">
                {message}
              </p>
            )}

            <p className="mt-6 text-center text-xs text-base-500">
              {mode === 'login' ? (
                <>
                  계정이 없나요?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="text-base-700 transition-colors hover:text-base-900"
                  >
                    회원가입 →
                  </button>
                </>
              ) : (
                <>
                  이미 계정이 있나요?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-base-700 transition-colors hover:text-base-900"
                  >
                    로그인 →
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
