# SplatHub → TRELLIS Modal Fallback

HF Space 의 인증 ZeroGPU 쿼터가 소진됐을 때 자동으로 전환되는 **2순위 백업**.

## 어떻게 동작하는가

```
[1순위] 브라우저 → Vercel /api/hf-3d → floerw HF Space (인증 토큰) → TRELLIS → .glb
                                  ↓ 쿼터 소진 시 에러 반환

[2순위] 브라우저 → Modal endpoint (익명) → microsoft/TRELLIS → .glb
```

Modal 에서 GPU 를 쓰는 게 아니라 **얇은 Python proxy** 만 돌린다. microsoft/TRELLIS
는 그대로 쓰되, Modal IP 풀에서 나가면 익명 쿼터 풀이 별개라서 우리 인증
쿼터 소진돼도 살아남는다.

Modal 측 비용: GPU 미사용 → CPU 호출당 $0.0005 이하, $30/월 크레딧이 사실상 무한.

## 배포 (한 번만 하면 됨)

### 1. Modal 계정 생성
https://modal.com/signup → GitHub 로 가입 → 신규 계정 **$30 무료 크레딧 자동 지급**
(카드 등록 불필요)

### 2. Modal CLI 설치 + 인증

```bash
cd worker/modal
pip install modal>=0.70.0
modal token new
```

`modal token new` 명령이 브라우저를 열어 Modal 웹에서 인증을 요청함.
"Verify device" 누르면 로컬 CLI 에 토큰이 저장됨.

### 3. 배포

```bash
modal deploy app.py
```

성공하면 아래 형태의 URL 이 출력됨 (ASGI 앱 base):

```
✓ Created web endpoint app => https://<USER>--splathub-trellis-fallback-app.modal.run
```

`<USER>` 는 Modal 계정 username.

### 4. 헬스체크

```bash
curl https://<USER>--splathub-trellis-fallback-app.modal.run/health
# {"status":"ok","service":"splathub-trellis-fallback","target":"microsoft/TRELLIS","mode":"anonymous-proxy"}
```

### 5. Vercel env var 등록

Vercel 대시보드 → Project Settings → Environment Variables:

| Key | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_MODAL_FALLBACK_URL` | `https://<USER>--splathub-trellis-fallback-app.modal.run/convert` | Production, Preview |

⚠️ 끝에 `/convert` 붙여야 함 (ASGI 앱의 라우트).

`NEXT_PUBLIC_` prefix 라 클라이언트 번들에 노출돼도 됨 (Modal 엔드포인트는 Modal
자체 rate limit 이 걸려있어 안전).

env 추가 후 Vercel 에서 Redeploy → 끝.

## 테스트

```bash
# Modal /convert 엔드포인트 직접 호출
python -c "
import base64, json, urllib.request
with open('test.jpg','rb') as f:
    b64 = base64.b64encode(f.read()).decode()
payload = json.dumps({'image_b64': b64}).encode()
req = urllib.request.Request(
    'https://<USER>--splathub-trellis-fallback-app.modal.run/convert',
    data=payload,
    headers={'Content-Type':'application/json'},
    method='POST',
)
res = urllib.request.urlopen(req, timeout=180)
data = json.loads(res.read())
print('ok:', data.get('ok'), 'size:', data.get('size'))
if data.get('ok'):
    glb = base64.b64decode(data['glb_b64'])
    with open('result.glb','wb') as f: f.write(glb)
    print('saved result.glb', len(glb), 'bytes')
"
```

## 운영 팁

- **콜드 스타트**: 컨테이너가 60초 이상 idle 이면 scale to zero. 다음 호출
  시 컨테이너 부팅에 ~10-20 초 추가. TRELLIS 자체 추론 (~45 초) 과 합쳐
  최대 70 초 정도.
- **웜 유지**: 활발히 쓰이는 시간대엔 자동으로 warm 상태. 연속 호출 시
  ~45-60 초.
- **익명 쿼터**: Modal IP 풀도 하루 쿼터가 있지만, 우리 Vercel 보다 **훨씬 큼**
  (Modal 컨테이너 IP 가 계속 바뀜). 사실상 rate limit 에 걸리기 어려움.
- **크레딧 추적**: Modal dashboard → Usage 에서 월 사용량 확인. GPU 없이
  CPU proxy 만 쓰므로 1000 건 호출해도 $1 안 나옴.

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `modal deploy` 가 "no token" 에러 | `modal token new` 재실행 |
| 빌드 단계에서 멈춤 (5분+) | 첫 배포는 Docker 이미지 빌드로 5-10 분 소요. 이후 배포는 캐시돼서 30초. |
| endpoint 404 | `<USER>` 자리에 실제 Modal username 넣었는지 확인 |
| "ok: false, error: No GPU was available" | microsoft/TRELLIS 자체 쿼터 이슈. 1-2 분 뒤 재시도. |
