# Speech To Text

A sleek, self-hosted web interface that supports multiple Speech-to-Text (STT) providers out of the box. Use the privacy-first local [faster-whisper](https://github.com/SYSTRAN/faster-whisper) engine on your CPU, tap into blazing fast cloud APIs like **Deepgram** and **Sarvam AI**, or utilize the **Browser Native Dictation** API.

This project consists of two parts:
1. **Server (`/server`)**: A Python-based API server running `faster-whisper` and securely proxying requests to external APIs (Sarvam, Deepgram).
2. **Frontend (`/frontend`)**: A clean, vanilla HTML/JS/CSS web interface for uploading audio files, previewing them, performing live dictation, and selecting your preferred STT provider.

## Features

- **Multi-Provider Support**: Seamlessly switch between Local Whisper, Sarvam AI, Deepgram, and Browser Native Dictation.
- **Privacy-first Local Mode**: Run Whisper processing entirely on your machine.
- **Live Dictation**: Record voice directly from your microphone using the native Web Speech API.
- **Fast Resampling**: The frontend can optionally resample audio to 16kHz mono in the browser via the Web Audio API to significantly reduce upload times.
- **Context Hints**: You can provide a vocabulary prompt to bias the model towards specific domain jargon.
- **Drag & Drop**: Simple and intuitive drag-and-drop file upload interface.
- **Docker Support**: The backend can be easily deployed using Docker and Docker Compose.

## Quick Start

### 1. Start the Backend Server

First, spin up the STT backend server. You can run it natively via `uv` or `pip`, or using Docker.

**Using Docker (Recommended):**
```bash
cd server
docker compose up -d --build
```
This will start the server at `http://localhost:8010`.

**Or using uv (fastest):**
```bash
cd server
uv sync
uv run uvicorn server:app --host 0.0.0.0 --port 8010
```

*For more backend configuration options, see the [server/README.md](server/README.md).*

### 2. Open the Frontend

Once the server is running on `http://localhost:8010`, you can open the frontend to start transcribing audio.

Since it's built with vanilla web technologies, you can simply open the `index.html` file in your browser:

```bash
# On Linux/macOS
xdg-open frontend/index.html
# or
open frontend/index.html
```

Or you can serve it with a simple HTTP server:
```bash
cd frontend
python3 -m http.server 8000
```
Then navigate to `http://localhost:8000` in your web browser.
