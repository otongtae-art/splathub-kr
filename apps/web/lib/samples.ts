/**
 * M1 단계의 샘플 모델 카탈로그.
 *
 * M1에서는 아직 DB/Supabase가 붙지 않았으므로, /m/[slug] 가 여기서 정적으로 검색한다.
 * M4 (가입·저장·공유) 진입 시 이 배열은 삭제되고 `getModelBySlug(slug)` 가
 * Supabase RLS 쿼리로 대체된다.
 *
 * 샘플 .spz / .ply 파일은 공개 HF Dataset / 레퍼런스 커뮤니티에서 제공하는
 * 재배포 가능한 파일을 R2 또는 public/samples/ 에 올려 사용한다. 저작권 확인된 것만.
 */

import type { Model } from '@/lib/shared/types';

export type SampleModel = Pick<
  Model,
  | 'id'
  | 'slug'
  | 'title'
  | 'description'
  | 'tags'
  | 'license'
  | 'spz_url'
  | 'thumbnail_url'
  | 'preview_urls'
  | 'view_count'
  | 'like_count'
  | 'allow_download'
  | 'allow_embed'
> & {
  /** 제작자 표시용 단순 핸들 (M1엔 profiles 테이블 없음) */
  author_handle: string;
};

/**
 * 실제 URL은 프로젝트 초기 세팅 시 수동으로 넣는다.
 * 파일이 아직 호스팅되지 않았다면 placeholder 상태로 두되, UI는 "모델을 불러오지 못했습니다"
 * 를 표시하며 gracefully degrade 한다.
 */
export const SAMPLE_MODELS: SampleModel[] = [
  {
    id: 'sample-butterfly',
    slug: 'sample-butterfly',
    title: '나비 (Butterfly)',
    description:
      'Spark.js 공식 데모에서 제공하는 3D Gaussian Splat 나비 모델. 뷰어에서 마우스/터치로 돌려볼 수 있습니다.',
    tags: ['동물', '자연', 'sample'],
    license: 'cc-by',
    spz_url: '/samples/butterfly.spz',
    thumbnail_url: '',
    preview_urls: [],
    view_count: 1247,
    like_count: 89,
    allow_download: true,
    allow_embed: true,
    author_handle: 'sparkjs',
  },
];

export function getSampleBySlug(slug: string): SampleModel | undefined {
  return SAMPLE_MODELS.find((m) => m.slug === slug);
}
