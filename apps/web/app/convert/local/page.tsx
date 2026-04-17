import Link from 'next/link';
import { ArrowLeft, Cpu } from '@phosphor-icons/react/dist/ssr';

export const metadata = {
  title: '내 PC로 직접 변환 (WebGPU)',
  description: 'Brush WebGPU로 브라우저 안에서 직접 학습합니다.',
};

export default function ConvertLocalPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col gap-6 px-6 py-14 safe-top safe-bottom sm:px-10">
      <Link
        href="/convert"
        className="inline-flex items-center gap-1 text-xs text-base-500 transition-colors hover:text-base-800"
      >
        <ArrowLeft size={11} weight="regular" />
        서버 변환으로 돌아가기
      </Link>
      <header className="flex flex-col gap-2 animate-slide-up">
        <h1 className="text-2xl font-semibold tracking-tight text-base-900">
          내 PC로 직접 3D 만들기
        </h1>
        <p className="max-w-[55ch] text-sm text-base-500">
          서버 할당량이 부족하거나 네트워크 없이 돌리고 싶다면 브라우저 WebGPU로 직접
          학습할 수 있습니다. Chrome 134+ / Edge 134+ 에서 가장 안정적입니다.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-md border border-dashed border-base-200 bg-base-50 p-6 animate-fade-in">
        <div className="flex items-center gap-2">
          <Cpu size={16} weight="regular" className="text-base-500" />
          <p className="text-sm font-medium text-base-800">WebGPU 학습기 통합 중 · M3</p>
        </div>
        <p className="text-xs leading-relaxed text-base-500">
          Brush (Rust/WASM) 엔진을 이 페이지 아래 임베드해 로컬 학습을 제공합니다.
          현재는 스텁이며 실제 엔진 번들은{' '}
          <code className="rounded-xs bg-base-100 px-1 py-0.5 font-mono text-[11px]">
            public/brush/
          </code>{' '}
          아래에 배치됩니다.
        </p>
      </div>
    </main>
  );
}
