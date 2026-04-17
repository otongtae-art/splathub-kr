import Link from 'next/link';

export const metadata = {
  title: '내 PC로 직접 변환 (WebGPU)',
  description: 'Brush WebGPU로 브라우저 안에서 직접 학습합니다. 서버 부담 0, 완전 로컬.',
};

/**
 * /convert/local — 4순위 폴백. Brush (Rust/WASM) 를 임베드할 예정.
 * 빌드 산출물이 크고 교차 오리진 격리(COOP/COEP)가 필요해 별도 라우트.
 * M3 에서 실제 Brush WASM 번들을 `public/brush/` 아래에 두고 `<script type="module">` 로 로드.
 */
export default function ConvertLocalPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col gap-6 px-6 py-14 safe-top safe-bottom sm:px-10">
      <Link href="/convert" className="text-xs text-ink-400 hover:text-ink-100">
        ← 서버 변환으로 돌아가기
      </Link>
      <h1 className="text-2xl font-semibold">내 PC로 직접 3D 만들기</h1>
      <p className="text-sm leading-relaxed text-ink-300">
        서버 할당량이 부족하거나, 네트워크 없이 돌리고 싶다면 브라우저 WebGPU로 직접 학습할 수 있습니다.
        Chrome 134+ / Edge 134+ 에서 가장 안정적입니다. 모바일은 아직 지원하지 않아요.
      </p>
      <div className="rounded-xl border border-dashed border-ink-600 bg-ink-800/40 p-6 text-sm text-ink-300">
        <p className="font-medium text-ink-100">🚧 WebGPU 학습기 통합 중 (M3)</p>
        <p className="mt-1">
          Brush (Rust/WASM) 엔진을 이 페이지 아래 임베드해 로컬 학습을 제공합니다. 현재는 스텁이며,
          실제 엔진 번들은 <code className="rounded bg-ink-900 px-1 py-0.5 font-mono text-xs">public/brush/</code>
          아래에 배치됩니다.
        </p>
      </div>
    </main>
  );
}
