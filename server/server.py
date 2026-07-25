import io
import os
import wave

import numpy as np
from faster_whisper import WhisperModel
from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

app = FastAPI()
# Same CORS_ORIGIN convention as the Node backend (backend/src/config/index.js)
# — some pages call this sidecar directly from the browser instead of relaying
# through the backend, so the actual OPTIONS preflight/response headers need
# to come from real CORS middleware, not a route that just accepts OPTIONS.
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("WHISPER_CORS_ORIGIN", "http://localhost:3000").split(",")
]

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE)


def wav_bytes_to_pcm_array(wav_bytes):
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        assert wf.getframerate() == 16000, "expected 16kHz audio"
        assert wf.getnchannels() == 1, "expected mono audio"
        frames = wf.readframes(wf.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def run_transcribe(audio, prompt, task="transcribe"):
    segments, _info = model.transcribe(
        audio,
        task=task,
        initial_prompt=prompt or None,
        vad_filter=True,
    )
    return " ".join(seg.text.strip() for seg in segments).strip()


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE}


@app.post("/transcribe")
async def transcribe(request: Request, prompt: str = ""):
    wav_bytes = await request.body()
    if not wav_bytes:
        raise HTTPException(status_code=400, detail="empty body")

    try:
        audio = wav_bytes_to_pcm_array(wav_bytes)
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"invalid wav: {err}")

    # model.transcribe() is a blocking CPU call — run it off the event loop so
    # concurrent requests (health checks, other reps' calls) aren't stalled.
    text = await run_in_threadpool(run_transcribe, audio, prompt, "transcribe")
    return {"text": text}


@app.post("/translate")
async def translate(request: Request, prompt: str = ""):
    wav_bytes = await request.body()
    if not wav_bytes:
        raise HTTPException(status_code=400, detail="empty body")

    try:
        audio = wav_bytes_to_pcm_array(wav_bytes)
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"invalid wav: {err}")

    # model.transcribe() is a blocking CPU call
    text = await run_in_threadpool(run_transcribe, audio, prompt, "translate")
    return {"text": text}
