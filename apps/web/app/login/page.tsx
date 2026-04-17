'use client';

/**
 * /login — 로그인/회원가입 페이지.
 * Supabase Auth (이메일 + Google OAuth + Kakao OAuth).
 * Supabase 미연결 시 게스트 모드로 안내.
 */

import Link from 'next/link';
import { useState } from 'react';
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
    <div className="flex min-h-[100dvh] items-center justify-center bg-ink-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="text-2xl font-bold text-accent-500">
            SplatHub
          </Link>
          <p className="mt-2 text-sm text-ink-400">
            {mode === 'login' ? '로그인' : '회원가입'}
          </p>
        </div>

        {!connected && (
          <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
            <p className="text-sm font-medium text-yellow-200">Supabase 미연결</p>
            <p className="mt-1 text-xs text-yellow-200/70">
              .env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를
              설정하면 로그인이 활성화됩니다. 지금은 게스트 모드로 이용하세요.
            </p>
            <Link
              href="/"
              className="mt-3 inline-block rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-ink-900"
            >
              게스트로 시작하기
            </Link>
          </div>
        )}

        {connected && (
          <>
            {/* OAuth 버튼 */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleOAuth('google')}
                className="flex items-center justify-center gap-2 rounded-lg border border-ink-600 bg-ink-800 py-2.5 text-sm font-medium text-ink-100 transition hover:bg-ink-700"
              >
                <GoogleIcon />
                Google로 계속
              </button>
              <button
                type="button"
                onClick={() => handleOAuth('kakao')}
                className="flex items-center justify-center gap-2 rounded-lg bg-[#FEE500] py-2.5 text-sm font-medium text-[#191919] transition hover:bg-[#FDD835]"
              >
                💬 카카오로 계속
              </button>
            </div>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-ink-700" />
              <span className="text-xs text-ink-500">또는</span>
              <div className="h-px flex-1 bg-ink-700" />
            </div>

            {/* 이메일 폼 */}
            <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일"
                required
                className="rounded-lg border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm text-ink-50 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 (6자 이상)"
                required
                minLength={6}
                className="rounded-lg border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm text-ink-50 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-accent-500 py-2.5 text-sm font-semibold text-ink-900 transition hover:bg-accent-400 disabled:opacity-50"
              >
                {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
              </button>
            </form>

            {error && (
              <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </p>
            )}
            {message && (
              <p className="mt-3 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs text-green-200">
                {message}
              </p>
            )}

            <p className="mt-4 text-center text-xs text-ink-400">
              {mode === 'login' ? (
                <>
                  계정이 없나요?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="text-accent-500 hover:underline"
                  >
                    회원가입
                  </button>
                </>
              ) : (
                <>
                  이미 계정이 있나요?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-accent-500 hover:underline"
                  >
                    로그인
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
