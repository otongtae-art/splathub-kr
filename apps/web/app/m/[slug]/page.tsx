import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DownloadSimple, ArrowLeft, Heart, Eye } from '@phosphor-icons/react/dist/ssr';
import ViewerShell from '@/components/viewer/ViewerShell';
import { SAMPLE_MODELS, getSampleBySlug } from '@/lib/samples';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ModelPage({ params }: PageProps) {
  const { slug } = await params;
  const model = getSampleBySlug(slug);
  if (!model) notFound();

  return (
    <main className="flex min-h-[100dvh] flex-col">
      <div className="h-[70dvh] w-full border-b border-base-100">
        <ViewerShell url={model.spz_url} title={model.title} subtitle={`@${model.author_handle}`} />
      </div>
      <section className="mx-auto w-full max-w-3xl px-6 py-6 sm:px-8 animate-fade-in">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Link
              href="/explore"
              className="inline-flex items-center gap-1 text-xs text-base-500 transition-colors hover:text-base-800"
            >
              <ArrowLeft size={11} weight="regular" />
              탐색
            </Link>
            <h1 className="text-xl font-semibold tracking-tight text-base-900">
              {model.title}
            </h1>
            <div className="flex items-center gap-3 text-xs text-base-500">
              <span>@{model.author_handle}</span>
              <span className="inline-flex items-center gap-1">
                <Eye size={11} weight="regular" />
                {model.view_count.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart size={11} weight="regular" />
                {model.like_count}
              </span>
            </div>
          </div>
          {model.allow_download && (
            <a
              href={model.spz_url}
              download
              className="tactile inline-flex items-center gap-1.5 rounded-md border border-base-200 bg-base-50 px-3 py-1.5 text-sm text-base-700 transition-colors hover:border-base-300"
            >
              <DownloadSimple size={13} weight="regular" />
              .spz
            </a>
          )}
        </div>
        {model.description && (
          <p className="mt-5 max-w-[65ch] whitespace-pre-wrap border-t border-base-100 pt-5 text-sm leading-relaxed text-base-600">
            {model.description}
          </p>
        )}
        {model.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {model.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-sm bg-base-50 px-2 py-0.5 text-xs text-base-500"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
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

export function generateStaticParams() {
  return SAMPLE_MODELS.map((m) => ({ slug: m.slug }));
}
