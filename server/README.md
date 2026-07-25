# stt-whisper-server

Self-hosted, fully open-source speech-to-text backing the `whisper` STT
provider in `backend/src/sales-intel/services/stt/providers/whisper.js`.
Runs [faster-whisper](https://github.com/SYSTRAN/faster-whisper) locally on
CPU — no API key, no per-minute cost, audio never leaves this machine.

> **Note:** We also have a standalone web UI for testing transcriptions. See the [Root README](../README.md) for details on the frontend.

## Run it

```bash
cd server
python3.12 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/uvicorn server:app --host 0.0.0.0 --port 8010   # downloads the model on first run
```

Then point the backend at it:

```
STT_PROVIDER=whisper
WHISPER_BASE_URL=http://localhost:8010
```

## Run it with Docker (production)

This is how it runs in prod — no supervisorctl, Docker is the only process
manager. The image serves via `uvicorn`; the blocking `transcribe()` call
runs in a thread pool so it doesn't stall the event loop for other requests.

```bash
cd server
docker compose up -d --build
docker compose logs -f
```

Binds to `127.0.0.1:8010` only — the Node backend reaches it at
`http://localhost:8010`, same as the venv setup above. The downloaded model
is cached in a named volume (`whisper-model-cache`) so it survives container
restarts/rebuilds. Override `WHISPER_MODEL_SIZE` / `WHISPER_COMPUTE_TYPE` via
env vars before `docker compose up` if needed. `restart: unless-stopped`
handles crash recovery, same role supervisor's `autorestart` plays for the
other sidecars.

To deploy: `deploy/deploy-stt-whisper.sh` (pulls latest, `docker compose up -d --build`).

## Config

- `WHISPER_MODEL_SIZE` (default `small`) — faster-whisper model name (`tiny`,
  `base`, `small`, `medium`, `large-v3`, ...). Bigger = more accurate, slower
  on CPU.
- `WHISPER_COMPUTE_TYPE` (default `int8`) — CTranslate2 quantization; `int8`
  is the fast CPU-friendly default.
- `PORT` (default `8010`).

## Endpoints

- `GET /health`
- `POST /transcribe?prompt=<comma-separated vocabulary>` — body is raw WAV
  bytes (16kHz mono PCM16). The optional `prompt` biases recognition toward
  domain jargon the same way Google's `speechContexts` boost does.
