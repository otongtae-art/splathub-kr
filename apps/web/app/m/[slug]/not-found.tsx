import Link from 'next/link';

export default function ModelNotFound() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">모델을 찾을 수 없습니다</h1>
      <p className="text-sm text-ink-400">
        요청하신 모델이 비공개 상태이거나, 삭제되었거나, 주소를 다시 확인해 주세요.
      </p>
      <Link href="/" className="mt-4 rounded-md border border-ink-700 bg-ink-800 px-4 py-2 text-sm">
        홈으로
      </Link>
    </main>
  );
}
