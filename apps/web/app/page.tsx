import Link from 'next/link';

/**
 * 랜딩 페이지 (/).
 *
 * M1에서는 "변환 엔진이 제품의 심장"이라는 메시지만 단순히 보여주고
 * /capture · /convert · /m/sample-bonsai 셋으로 빠르게 이동할 수 있게 한다.
 * M5(소셜·탐색)에 들어서면 이 페이지 하단에 Explore 그리드가 붙는다.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col gap-16 px-6 py-16 safe-top safe-bottom sm:px-10 sm:py-24">
      <section className="flex flex-col items-start gap-6">
        <span className="rounded-full border border-ink-600 bg-ink-800/60 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-accent-500">
          Beta · 무료 커뮤니티
        </span>
        <h1 className="text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          카메라로 한번 찍어서
          <br />
          <span className="text-accent-500">3D Gaussian Splat</span> 으로.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-ink-200">
          웹캠·스마트폰 카메라로 대상 주변을 천천히 한 바퀴 돌리면, 브라우저 안에서 바로
          <span className="text-ink-50">.spz</span> 파일이 만들어지고 뷰어에서 돌려볼 수
          있습니다. 파일 업로드로도 됩니다.
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/capture"
            className="inline-flex items-center justify-center rounded-lg bg-accent-500 px-6 py-3 text-base font-semibold text-ink-900 shadow-lg shadow-accent-500/20 transition hover:bg-accent-400"
          >
            카메라로 시작하기
          </Link>
          <Link
            href="/convert"
            className="inline-flex items-center justify-center rounded-lg border border-ink-600 bg-ink-800 px-6 py-3 text-base font-semibold text-ink-50 transition hover:border-ink-400"
          >
            사진 파일 업로드
          </Link>
          <Link
            href="/m/sample-bonsai"
            className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-base font-medium text-ink-200 underline-offset-4 hover:text-ink-50 hover:underline"
          >
            샘플 모델 보기 →
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <FeatureCard
          title="웹캠/카메라 실시간"
          body="getUserMedia로 브라우저가 바로 카메라에 접속. 가이드 오버레이가 12구간 촬영을 도와줍니다."
        />
        <FeatureCard
          title="무료 Ladder GPU"
          body="HF Space ZeroGPU → Modal 크레딧 → 클라이언트 WebGPU까지 4중 폴백으로 언제나 0원."
        />
        <FeatureCard
          title="즉시 뷰어"
          body="Spark.js 기반 .spz/.ply 뷰어가 데스크톱·모바일에서 30fps로 회전·확대."
        />
      </section>

      <footer className="mt-auto border-t border-ink-700 pt-6 text-sm text-ink-400">
        © 2026 SplatHub · MIT ·{' '}
        <Link href="/licenses" className="underline-offset-4 hover:underline">
          오픈소스 attribution
        </Link>
      </footer>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800/40 p-5">
      <h3 className="mb-2 text-base font-semibold text-ink-50">{title}</h3>
      <p className="text-sm leading-relaxed text-ink-300">{body}</p>
    </div>
  );
}
