import io
import os
import wave

import numpy as np
from faster_whisper import WhisperModel
from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv

load_dotenv()

MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "")
DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")

import httpx

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

@app.post("/transcribe/sarvam")
async def transcribe_sarvam(request: Request, prompt: str = ""):
    if not SARVAM_API_KEY:
        raise HTTPException(status_code=400, detail="SARVAM_API_KEY is not configured on the server")
    
    wav_bytes = await request.body()
    if not wav_bytes:
        raise HTTPException(status_code=400, detail="empty body")
        
    url = "https://api.sarvam.ai/speech-to-text"
    headers = {
        "api-subscription-key": SARVAM_API_KEY
    }
    
    files = {
        "file": ("audio.wav", wav_bytes, "audio/wav")
    }
    data = {
        "model": "saaras:v3",
        "mode": "transcribe"
    }
    if prompt:
        data["prompt"] = prompt
        
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, data=data, files=files, timeout=60.0)
        
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Sarvam API error: {resp.text}")
        
    try:
        json_data = resp.json()
        transcript = json_data.get("transcript") or json_data.get("text") or resp.text
        return {"text": transcript}
    except:
        return {"text": resp.text}

@app.post("/transcribe/deepgram")
async def transcribe_deepgram(request: Request, prompt: str = ""):
    if not DEEPGRAM_API_KEY:
        raise HTTPException(status_code=400, detail="DEEPGRAM_API_KEY is not configured on the server")
        
    wav_bytes = await request.body()
    if not wav_bytes:
        raise HTTPException(status_code=400, detail="empty body")
        
    url = "https://api.deepgram.com/v1/listen?model=nova-3"
        
    headers = {
        "Authorization": f"Token {DEEPGRAM_API_KEY}",
        "Content-Type": "audio/wav"
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, content=wav_bytes, timeout=60.0)
        
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Deepgram API error: {resp.text}")
        
    try:
        json_data = resp.json()
        transcript = json_data["results"]["channels"][0]["alternatives"][0]["transcript"]
        return {"text": transcript}
    except:
        return {"text": resp.text}
