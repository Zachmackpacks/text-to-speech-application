import os
import tempfile
from pathlib import Path
from typing import Optional

import json
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

app = FastAPI(title="Speech to Text API")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")

_whisper_model: Optional[WhisperModel] = None


def get_whisper_model() -> WhisperModel:
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _whisper_model


def summarize_text(transcript: str) -> str:
    api_url = os.getenv("LLM_API_URL")
    api_key = os.getenv("LLM_API_KEY")
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")

    if not transcript.strip():
        return "No transcript available to summarize."

    if not api_url or not api_key:
        short = transcript.strip().split(".")
        return " ".join(short[:3]).strip() or transcript[:500]

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You summarize spoken transcripts into concise meeting/document notes.",
            },
            {
                "role": "user",
                "content": f"Summarize this transcript in bullet points:\n\n{transcript}",
            },
        ],
        "temperature": 0.2,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    req = urllib_request.Request(
        api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()
    except (HTTPError, URLError, TimeoutError, KeyError, json.JSONDecodeError) as exc:
        return f"Summary unavailable from external LLM API: {exc}"


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "whisper": {
            "device": DEVICE,
            "model_size": MODEL_SIZE,
            "compute_type": COMPUTE_TYPE,
        },
        "llm_configured": bool(os.getenv("LLM_API_URL") and os.getenv("LLM_API_KEY")),
    }


@app.post("/api/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str = Form(default="en"),
    beam_size: int = Form(default=5),
) -> dict:
    suffix = Path(audio.filename or "recording.webm").suffix or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        model = get_whisper_model()
        segments, info = model.transcribe(tmp_path, beam_size=beam_size, language=language)
        segment_list = list(segments)
        transcript = " ".join(segment.text.strip() for segment in segment_list).strip()

        if not transcript:
            raise HTTPException(status_code=400, detail="No speech detected in audio.")

        summary = summarize_text(transcript)

        return {
            "language": info.language,
            "duration": info.duration,
            "transcript": transcript,
            "segments": [
                {
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text.strip(),
                }
                for seg in segment_list
            ],
            "summary": summary,
        }
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass