# SplatHub TRELLIS Proxy — Docker SDK 로 직접 제어.
# Gradio SDK 모드는 HF 가 자동 demo.launch() 를 호출해서 mount_gradio_app 과
# 포트 충돌 발생. Docker SDK 로 우리가 uvicorn 만 띄우면 깔끔.

# Python 3.11 사용 — 3.13 의 audioop 제거 문제 회피
FROM python:3.11-slim

WORKDIR /app

# 시스템 의존성:
# - curl: healthcheck
# - libgl1, libglib2.0-0: rembg 가 OpenCV 를 사용하므로 필요
# - libgomp1: onnxruntime 이 OpenMP 사용
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# HF Spaces 관례: 비루트 사용자 user(uid 1000) 로 실행
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1

WORKDIR $HOME/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user app.py .

# HF Space 는 $PORT 환경변수로 포트 주입. 기본 7860.
ENV PORT=7860
EXPOSE 7860

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
