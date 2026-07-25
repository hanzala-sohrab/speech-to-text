FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.7.17 /uv /uvx /bin/

WORKDIR /app

# Install dependencies first so this layer is cached across code-only changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY server.py ./
RUN uv sync --frozen

ENV PATH="/app/.venv/bin:${PATH}"
# faster-whisper downloads the model via huggingface_hub on first run; pin the
# cache here so a mounted volume (see docker-compose.yml) survives restarts
# instead of re-downloading the model every time the container starts.
ENV HF_HOME=/app/.cache/huggingface

EXPOSE 8010

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:'+os.environ.get('PORT','8010')+'/health').status==200 else 1)"

# Single process: the whisper model loads once into memory, and server.py
# offloads the blocking transcribe() call to a thread pool so concurrent
# requests (health checks, other reps' calls) aren't stalled on the event loop.
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8010}"]
