import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ViewerShell from '@/components/viewer/ViewerShell';
import { SAMPLE_MODELS, getSampleBySlug } from '@/lib/samples';

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * M1 단계의 모델 상세 페이지.
 * 지금은 샘플 카탈로그만 조회. M4에 Supabase 쿼리로 교체되며 URL 구조는 유지.
 */
export default async function ModelPage({ params }: PageProps) {
  const { slug } = await params;
  const model = getSampleBySlug(slug);
  if (!model) notFound();

  return (
    <main className="flex min-h-[100dvh] flex-col">
      <div className="h-[70dvh] w-full border-b border-ink-800">
        <ViewerShell url={model.spz_url} title={model.title} subtitle={`@${model.author_handle}`} />
      </div>
      <section className="mx-auto w-full max-w-3xl px-6 py-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{model.title}</h1>
            <p className="text-sm text-ink-400">
              @{model.author_handle} · 조회 {model.view_count} · 좋아요 {model.like_count}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {model.allow_download && (
              <a
                href={model.spz_url}
                download
                className="rounded-md border border-ink-700 bg-ink-800 px-3 py-1.5 text-sm text-ink-100 hover:border-ink-500"
              >
                .spz 다운로드
              </a>
            )}
          </div>
        </div>
        {model.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-200">
            {model.description}
          </p>
        )}
        {model.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {model.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-ink-800 px-2.5 py-0.5 text-xs text-ink-300"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-8">
          <Link href="/" className="text-sm text-ink-400 hover:text-ink-100">
            ← 홈으로
          </Link>
        </div>
      </section>
    </main>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const model = getSampleBySlug(slug);
  if (!model) return { title: '찾을 수 없는 모델' };
  return {
    title: model.title,
    description: model.description ?? '3D Gaussian Splat 모델',
    openGraph: {
      title: model.title,
      description: model.description ?? undefined,
      images: model.thumbnail_url ? [model.thumbnail_url] : undefined,
    },
  };
}

/**
 * 샘플 모델 목록은 정적이므로 build-time prerender.
 */
export function generateStaticParams() {
  return SAMPLE_MODELS.map((m) => ({ slug: m.slug }));
}
