# Local Speech-to-Text + Summary Application

This project implements the local architecture you described:

- **React frontend** (`localhost:3000`)
- **FastAPI backend** (`localhost:8000`)
- **faster-whisper on local CPU** for transcription
- **External LLM API** for optional summary generation

## Project structure

```
.
├── backend/
│   ├── app/main.py
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── tests/
└── frontend/
    ├── src/App.jsx
    └── ...
```

## Features

- Record audio from browser microphone
- Pause and resume recording
- Save recording locally in-browser
- Send audio to FastAPI for local transcription
- Generate summary via external LLM API (or fallback local summary if no API configured)
- Download transcript + summary as `.txt`

## Prerequisites

- Python 3.10+
- Node.js 18+
- FFmpeg installed (required by whisper backends)

## 1) Run backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Optional environment variables

```bash
export WHISPER_MODEL_SIZE=base
export WHISPER_DEVICE=cpu
export WHISPER_COMPUTE_TYPE=int8

# Comma-separated list for frontend origins
export ALLOWED_ORIGINS=http://localhost:3000

# External LLM summary (OpenAI-compatible chat completions endpoint)
export LLM_API_URL=https://api.openai.com/v1/chat/completions
export LLM_API_KEY=your_api_key
export LLM_MODEL=gpt-4o-mini
```

If LLM variables are not set, the backend returns a simple fallback summary from transcript content.

## 2) Run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:3000`

## 3) Run backend tests

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

## API endpoints

- `GET /api/health` → health check and runtime config flags
- `POST /api/transcribe` (multipart/form-data)
  - `audio` file required
  - `language` optional (default: `en`)
  - `beam_size` optional (default: `5`)

## Local deployment notes

This app is suitable for local deployment with two terminal sessions.
