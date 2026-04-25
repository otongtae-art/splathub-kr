#!/usr/bin/env pwsh
# HF Space 자동 배포 스크립트 — Windows PowerShell 버전 (round 30)
#
# 사용법:
#   $env:HF_TOKEN = 'hf_xxx_write_token'
#   .\deploy.ps1 floerw splathub-trellis-proxy
#
# 또는 토큰 미설정 시 안전하게 prompt 됨:
#   .\deploy.ps1 floerw splathub-trellis-proxy
#   → "HF write token: " 입력 받음
#
# 스크립트가 하는 일:
#   1. (필요 시) huggingface_hub Python 패키지 설치
#   2. HF Space 존재 확인 / 생성
#   3. app.py + requirements.txt + README.md + Dockerfile + pre-requirements.txt 업로드
#   4. 배포 URL + R4 활성화 안내 출력
#
# 필요:
#   - Python 3.8+ (`python --version`)
#   - HF write 권한 token (https://huggingface.co/settings/tokens)
#
# 이게 R4 (VGGT Pointmap Branch) 를 활성화하는 유일한 방법 —
# 자율 루프가 read-only token 으로 push 불가.

param(
    [string]$Username = "floerw",
    [string]$SpaceName = "splathub-trellis-proxy"
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# ─── HF Token 확인 / prompt ─────────────────────────────────────
if (-not $env:HF_TOKEN) {
    Write-Host ""
    Write-Host "→ HF write token 필요" -ForegroundColor Yellow
    Write-Host "  https://huggingface.co/settings/tokens 에서 발급"
    Write-Host "  필요 권한: Write (또는 Fine-grained 토큰의 Repo: Write)"
    Write-Host ""
    $secure = Read-Host "HF token (입력은 숨김)" -AsSecureString
    $env:HF_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )
}
if (-not $env:HF_TOKEN -or $env:HF_TOKEN.Length -lt 10) {
    Write-Host "Error: HF_TOKEN 비어있음 또는 너무 짧음" -ForegroundColor Red
    exit 1
}

# ─── Python 의존성 자동 설치 ────────────────────────────────────
Write-Host "→ huggingface_hub 확인" -ForegroundColor Cyan
$check = python -c "import huggingface_hub; print(huggingface_hub.__version__)" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  pip install huggingface_hub..." -ForegroundColor DarkGray
    python -m pip install -q huggingface_hub
}

$SpaceId = "$Username/$SpaceName"
$SpaceUrl = "https://$Username-$($SpaceName -replace '_','-').hf.space"

# ─── Step 1: Space 생성 / 확인 ──────────────────────────────────
Write-Host ""
Write-Host "→ HF Space 생성/확인: $SpaceId" -ForegroundColor Cyan
$createScript = @"
import os
from huggingface_hub import create_repo
try:
    create_repo(
        repo_id='$SpaceId',
        repo_type='space',
        space_sdk='docker',
        token=os.environ['HF_TOKEN'],
        exist_ok=True,
    )
    print('  ✓ Space 존재 확인')
except Exception as e:
    print(f'  ! {e}')
    raise
"@
python -c $createScript
if ($LASTEXITCODE -ne 0) { exit 1 }

# ─── Step 2: 파일 업로드 ────────────────────────────────────────
Write-Host ""
Write-Host "→ 파일 업로드" -ForegroundColor Cyan
$files = @('app.py', 'requirements.txt', 'pre-requirements.txt', 'README.md', 'Dockerfile')
foreach ($f in $files) {
    if (-not (Test-Path $f)) {
        Write-Host "  ! $f (파일 없음, skip)" -ForegroundColor DarkYellow
        continue
    }
    $uploadScript = @"
import os
from huggingface_hub import HfApi
api = HfApi(token=os.environ['HF_TOKEN'])
try:
    api.upload_file(
        path_or_fileobj='$f',
        path_in_repo='$f',
        repo_id='$SpaceId',
        repo_type='space',
    )
    print('  ✓ $f')
except Exception as e:
    print(f'  ! $f: {e}')
"@
    python -c $uploadScript
}

# ─── Step 3: 결과 안내 ──────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "✓ 배포 완료" -ForegroundColor Green
Write-Host ""
Write-Host "Space 대시보드: https://huggingface.co/spaces/$SpaceId"
Write-Host "API URL: $SpaceUrl"
Write-Host ""
Write-Host "→ R4 (VGGT Pointmap Branch) 활성화 확인:" -ForegroundColor Yellow
Write-Host "  Space 가 재시작 후 (~2분) 다음 환경변수가 적용됨:"
Write-Host "    VGGT_PREDICTION_MODE='Pointmap Branch' (default in app.py)"
Write-Host "    VGGT_CONF_THRES='3' (default in app.py)"
Write-Host ""
Write-Host "  더 빠르게 적용하려면 Space Settings → Variables 에서"
Write-Host "  위 두 변수 직접 추가 후 Restart."
Write-Host ""
Write-Host "  적용 확인: 다음 VGGT 호출 결과의 'monster' 발생률이"
Write-Host "  R5 viewerStats 패널에서 감소해야 함."
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
