# universal-stt-server

Self-hosted API server for Speech-to-Text operations. Originally designed to back the `whisper` STT provider running [faster-whisper](https://github.com/SYSTRAN/faster-whisper) locally on CPU, it now also serves as a secure proxy for cloud APIs like Sarvam AI and Deepgram.

> **Note:** We also have a standalone web UI for testing transcriptions. See the [Root README](../README.md) for details on the frontend.

## Run it

```bash
cd server
uv sync
uv run uvicorn server:app --host 0.0.0.0 --port 8010   # downloads the model on first run
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

Binds to `127.0.0.1:8010` only. The downloaded model
is cached in a named volume (`whisper-model-cache`) so it survives container
restarts/rebuilds. Override `WHISPER_MODEL_SIZE` / `WHISPER_COMPUTE_TYPE` via
env vars before `docker compose up` if needed. `restart: unless-stopped`
handles crash recovery.

To deploy: `deploy/deploy-stt-whisper.sh` (pulls latest, `docker compose up -d --build`).

## Config (Environment Variables)

- `WHISPER_MODEL_SIZE` (default `small`) — faster-whisper model name (`tiny`,
  `base`, `small`, `medium`, `large-v3`, ...). Bigger = more accurate, slower
  on CPU.
- `WHISPER_COMPUTE_TYPE` (default `int8`) — CTranslate2 quantization; `int8`
  is the fast CPU-friendly default.
- `PORT` (default `8010`).
- `SARVAM_API_KEY` — (Optional) API key for Sarvam AI integration.
- `DEEPGRAM_API_KEY` — (Optional) API key for Deepgram integration.

*Note: You can place an `.env` file at the root of the project to configure these automatically for Docker Compose.*

## Endpoints

- `GET /health`
- `POST /transcribe?prompt=<comma-separated vocabulary>` — Local Whisper transcription. Body is raw WAV bytes (16kHz mono PCM16). The optional `prompt` biases recognition toward domain jargon.
- `POST /transcribe/sarvam` — Proxies the audio payload to the Sarvam AI STT API.
- `POST /transcribe/deepgram` — Proxies the audio payload to the Deepgram API.
