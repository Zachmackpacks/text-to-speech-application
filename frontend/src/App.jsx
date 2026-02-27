import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!audioBlob) {
      setAudioUrl('');
      return;
    }

    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [audioBlob]);

  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setSeconds((prev) => prev + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    setError('');
    setTranscript('');
    setSummary('');
    setAudioBlob(null);
    setSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
      };

      recorder.start();
      setIsRecording(true);
      setIsPaused(false);
      startTimer();
    } catch (err) {
      setError(`Microphone access failed: ${err.message}`);
    }
  };

  const togglePause = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (isPaused) {
      recorder.resume();
      setIsPaused(false);
      startTimer();
    } else {
      recorder.pause();
      setIsPaused(true);
      stopTimer();
    }
  };

  const saveRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.stop();
    stopTimer();
    setIsRecording(false);
    setIsPaused(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const transcribeRecording = async () => {
    if (!audioBlob) return;
    setIsLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('language', 'en');

      const response = await axios.post(`${API_BASE_URL}/api/transcribe`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setTranscript(response.data.transcript || '');
      setSummary(response.data.summary || '');
    } catch (err) {
      const message = err.response?.data?.detail || err.message;
      setError(`Transcription failed: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadDocument = () => {
    const content = `Transcript\n==========\n${transcript}\n\nSummary\n=======\n${summary}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcript-summary.txt';
    a.click();

    URL.revokeObjectURL(url);
  };

  return (
    <main className="container">
      <h1>🎙️ Speech to Text + Summary</h1>
      <p>Record audio, pause/resume, save, transcribe, summarize, and download your notes.</p>

      <section className="controls">
        <button onClick={startRecording} disabled={isRecording}>Start Recording</button>
        <button onClick={togglePause} disabled={!isRecording}>{isPaused ? 'Resume' : 'Pause'}</button>
        <button onClick={saveRecording} disabled={!isRecording}>Save Recording</button>
      </section>

      <div className="timer">Recording time: {formatTime(seconds)}</div>

      {audioUrl && (
        <section className="panel">
          <h2>Saved Recording</h2>
          <audio controls src={audioUrl} />
          <button className="primary" onClick={transcribeRecording} disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Transcribe + Summarize'}
          </button>
        </section>
      )}

      {error && <div className="error">{error}</div>}

      {(transcript || summary) && (
        <section className="panel">
          <h2>Results</h2>
          <h3>Transcript</h3>
          <p>{transcript}</p>
          <h3>Summary</h3>
          <p>{summary}</p>
          <button className="primary" onClick={downloadDocument}>Download .txt</button>
        </section>
      )}
    </main>
  );
}