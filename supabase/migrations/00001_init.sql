-- SplatHub-KR: 초기 데이터베이스 스키마
-- 실행: npx supabase db push (클라우드) 또는 npx supabase db reset (로컬)

-- ─────────────────────── 프로필 ───────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle TEXT UNIQUE NOT NULL CHECK (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro','enterprise')),
  credits_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_handle ON profiles(handle);

-- 신규 가입 시 자동 프로필 생성 트리거
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, handle, display_name, avatar_url)
  VALUES (
    NEW.id,
    LOWER(REPLACE(COALESCE(NEW.raw_user_meta_data->>'name', 'user_' || LEFT(NEW.id::text, 8)), ' ', '_')),
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────── 업로드 ───────────────────────
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  width INTEGER,
  height INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_uploads_owner ON uploads(owner_id, uploaded_at DESC);

-- ─────────────────────── 변환 작업 ───────────────────────
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'photo_to_splat',
  tier TEXT NOT NULL DEFAULT 'free',
  quality TEXT DEFAULT 'fast',
  source TEXT, -- 'capture', 'upload', 'video'
  input_upload_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','preprocessing','pose_estimation','training','postprocessing','uploading','done','failed','canceled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  worker_backend TEXT,
  worker_job_id TEXT,
  result_model_id UUID,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_owner ON jobs(owner_id, created_at DESC);
CREATE INDEX idx_jobs_status ON jobs(status) WHERE status NOT IN ('done','failed','canceled');

-- ─────────────────────── 모델 (3D) ───────────────────────
CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  license TEXT NOT NULL DEFAULT 'cc-by-nc' CHECK (license IN ('cc-by','cc-by-nc','cc0','proprietary')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted','private')),
  tier TEXT NOT NULL DEFAULT 'free',

  -- 파일 URL
  spz_url TEXT,
  ply_url TEXT,
  sog_url TEXT,
  thumbnail_url TEXT,
  preview_urls TEXT[] DEFAULT '{}',

  -- 크기·통계
  spz_size_bytes BIGINT,
  ply_size_bytes BIGINT,
  gaussian_count INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,

  -- 허용 플래그
  allow_download BOOLEAN NOT NULL DEFAULT true,
  allow_embed BOOLEAN NOT NULL DEFAULT true,

  -- Phase 2: 마켓플레이스
  price_krw INTEGER NOT NULL DEFAULT 0,
  listing_type TEXT NOT NULL DEFAULT 'free' CHECK (listing_type IN ('free','paid')),
  allow_commercial BOOLEAN NOT NULL DEFAULT false,

  source_job_id UUID,

  -- 풀텍스트 검색
  search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description,'')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(tags,' ')), 'C')
  ) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_models_owner ON models(owner_id);
CREATE INDEX idx_models_visibility ON models(visibility, created_at DESC);
CREATE INDEX idx_models_tags ON models USING GIN(tags);
CREATE INDEX idx_models_search ON models USING GIN(search_tsv);
CREATE INDEX idx_models_slug ON models(slug);

-- ─────────────────────── 소셜 ───────────────────────
CREATE TABLE likes (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, model_id)
);
CREATE INDEX idx_likes_model ON likes(model_id);

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) <= 2000),
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_model ON comments(model_id, created_at DESC);

CREATE TABLE follows (
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE collection_models (
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, model_id)
);

-- ─────────────────────── 사용 로그 (할당량) ───────────────────────
CREATE TABLE usage_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  job_id UUID,
  model_id UUID,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_user ON usage_logs(user_id, created_at DESC);

-- ─────────────────────── Phase 2: 마켓플레이스 ───────────────────────
CREATE TABLE seller_profiles (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT CHECK (provider IN ('stripe','toss')),
  provider_account_id TEXT,
  kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending','verified','rejected')),
  payout_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  price_krw INTEGER NOT NULL,
  commission_krw INTEGER NOT NULL, -- 20%
  seller_net_krw INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','failed')),
  provider_payment_id TEXT,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_buyer ON orders(buyer_id, created_at DESC);
CREATE INDEX idx_orders_seller ON orders(seller_id, created_at DESC);

-- ─────────────────────── RLS (Row Level Security) ───────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 프로필: 누구나 읽기, 본인만 수정
CREATE POLICY profiles_read ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (id = auth.uid());

-- 모델: 공개 읽기, 본인만 쓰기
CREATE POLICY models_read ON models FOR SELECT USING (visibility = 'public' OR owner_id = auth.uid());
CREATE POLICY models_insert ON models FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY models_update ON models FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY models_delete ON models FOR DELETE USING (owner_id = auth.uid());

-- 작업: 본인만
CREATE POLICY jobs_all ON jobs FOR ALL USING (owner_id = auth.uid());

-- 업로드: 본인만
CREATE POLICY uploads_all ON uploads FOR ALL USING (owner_id = auth.uid());

-- 좋아요: 읽기 공개, 쓰기 본인
CREATE POLICY likes_read ON likes FOR SELECT USING (true);
CREATE POLICY likes_insert ON likes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY likes_delete ON likes FOR DELETE USING (user_id = auth.uid());

-- 댓글: 읽기 공개, 쓰기 본인
CREATE POLICY comments_read ON comments FOR SELECT USING (true);
CREATE POLICY comments_insert ON comments FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY comments_delete ON comments FOR DELETE USING (author_id = auth.uid());

-- 팔로우: 읽기 공개, 쓰기 본인
CREATE POLICY follows_read ON follows FOR SELECT USING (true);
CREATE POLICY follows_insert ON follows FOR INSERT WITH CHECK (follower_id = auth.uid());
CREATE POLICY follows_delete ON follows FOR DELETE USING (follower_id = auth.uid());

-- 컬렉션: 공개 읽기, 본인 쓰기
CREATE POLICY collections_read ON collections FOR SELECT USING (visibility = 'public' OR owner_id = auth.uid());
CREATE POLICY collections_write ON collections FOR ALL USING (owner_id = auth.uid());

-- 사용 로그: 본인만
CREATE POLICY usage_all ON usage_logs FOR ALL USING (user_id = auth.uid());

-- 판매자: 본인만
CREATE POLICY seller_all ON seller_profiles FOR ALL USING (user_id = auth.uid());

-- 주문: 구매자/판매자
CREATE POLICY orders_read ON orders FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());
CREATE POLICY orders_insert ON orders FOR INSERT WITH CHECK (buyer_id = auth.uid());
