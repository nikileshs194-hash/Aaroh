"""Voice input: offline speech-to-text, one model per language, nothing leaves the computer.

- English: NVIDIA Parakeet TDT 0.6B v2 (int8) run by sherpa-onnx.            Licence CC-BY-4.0.
- Kannada: AI4Bharat IndicConformer 600M multilingual (int8 ONNX, CTC head).   Licence MIT.

Both load on first use and stay in memory. Audio arrives as 16 kHz mono 16-bit WAV from the browser.
"""
from __future__ import annotations

import io
import json
import os
import threading
import time
import wave
from pathlib import Path

import numpy as np

from .config import ROOT

SR = 16000
MAX_SECONDS = 30
THREADS = max(2, min(4, (os.cpu_count() or 4) // 4))


def speech_dir() -> Path:
    env = os.environ.get("AAROH_SPEECH_DIR")
    for d in ([Path(env)] if env else []) + [Path("D:/InferSmart-models/speech"), ROOT / "models" / "speech"]:
        if d.exists():
            return d
    return Path("D:/InferSmart-models/speech")


# ------------------------------------------------------------------ audio
def read_wav(data: bytes) -> np.ndarray:
    """16-bit PCM WAV -> float32 mono at 16 kHz (resampled linearly if needed)."""
    with wave.open(io.BytesIO(data)) as w:
        ch, sw, rate, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        if sw != 2:
            raise ValueError("Audio must be 16-bit WAV.")
        pcm = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768.0
    if ch > 1:
        pcm = pcm.reshape(-1, ch).mean(axis=1)
    if rate != SR and len(pcm):
        x_new = np.linspace(0, len(pcm) - 1, int(len(pcm) * SR / rate))
        pcm = np.interp(x_new, np.arange(len(pcm)), pcm).astype(np.float32)
    return pcm[: SR * MAX_SECONDS]


# ------------------------------------------------------------------ Kannada: IndicConformer features (numpy port of
# torchaudio.transforms.MelSpectrogram(16000, n_fft=512, win_length=400, hop_length=160, f_min=0, f_max=8000,
# n_mels=80, hann window, power=2.0) + log + per-feature normalisation, as used by the model's reference code)
N_FFT, WIN, HOP, N_MELS = 512, 400, 160, 80


def _mel_fbanks() -> np.ndarray:
    n_freqs = N_FFT // 2 + 1
    all_freqs = np.linspace(0, SR // 2, n_freqs)
    hz2mel = lambda f: 2595.0 * np.log10(1.0 + f / 700.0)
    mel2hz = lambda m: 700.0 * (10 ** (m / 2595.0) - 1.0)
    m_pts = np.linspace(hz2mel(0.0), hz2mel(8000.0), N_MELS + 2)
    f_pts = mel2hz(m_pts)
    f_diff = f_pts[1:] - f_pts[:-1]
    slopes = f_pts[None, :] - all_freqs[:, None]
    down = -slopes[:, :-2] / f_diff[:-1]
    up = slopes[:, 2:] / f_diff[1:]
    return np.maximum(0.0, np.minimum(down, up))  # (n_freqs, n_mels)


_FB = _mel_fbanks()
_WINDOW = np.zeros(N_FFT, dtype=np.float64)
_off = (N_FFT - WIN) // 2
_WINDOW[_off:_off + WIN] = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(WIN) / WIN)  # periodic Hann, centred


def indic_features(pcm: np.ndarray) -> np.ndarray:
    x = np.pad(pcm.astype(np.float64), (N_FFT // 2, N_FFT // 2), mode="reflect")
    n_frames = 1 + (len(x) - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(n_frames)[:, None]
    frames = x[idx] * _WINDOW
    power = np.abs(np.fft.rfft(frames, n=N_FFT, axis=1)) ** 2          # (frames, n_freqs)
    mel = (power @ _FB).T                                                # (n_mels, frames)
    feats = np.log(mel + 1e-9)
    mean = feats.mean(axis=1, keepdims=True)
    std = feats.std(axis=1, ddof=1, keepdims=True) + 1e-5
    return ((feats - mean) / std).astype(np.float32)


class _Kannada:
    def __init__(self, d: Path) -> None:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = THREADS
        self.enc = ort.InferenceSession(str(d / "onnx" / "encoder_quantized_int8.onnx"), opts, providers=["CPUExecutionProvider"])
        self.ctc = ort.InferenceSession(str(d / "onnx" / "ctc_decoder_quantized_int8.onnx"), opts, providers=["CPUExecutionProvider"])
        self.vocab = json.loads((d / "config" / "vocab.json").read_text(encoding="utf-8"))["kn"]
        self.mask = np.array(json.loads((d / "config" / "language_masks.json").read_text(encoding="utf-8"))["kn"], dtype=bool)

    def transcribe(self, pcm: np.ndarray) -> str:
        f = indic_features(pcm)[None, :, :]
        length = np.array([f.shape[2]], dtype=np.int64)
        ins = self.enc.get_inputs()
        feed = {ins[0].name: f}
        if len(ins) > 1:
            feed[ins[1].name] = length
        enc_out = self.enc.run(None, feed)[0]
        cins = self.ctc.get_inputs()
        cfeed = {cins[0].name: enc_out}
        if len(cins) > 1:
            cfeed[cins[1].name] = length
        logits = self.ctc.run(None, cfeed)[0][:, :, self.mask]
        ids = np.argmax(logits, axis=-1)[0]
        blank = logits.shape[-1] - 1
        out, prev = [], None
        for i in ids:
            i = int(i)
            if i != prev and i != blank and i < len(self.vocab):
                out.append(self.vocab[i])
            prev = i
        return "".join(out).replace("▁", " ").strip()


class _English:
    def __init__(self, d: Path) -> None:
        import sherpa_onnx
        self.rec = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=str(d / "encoder.int8.onnx"), decoder=str(d / "decoder.int8.onnx"),
            joiner=str(d / "joiner.int8.onnx"), tokens=str(d / "tokens.txt"),
            num_threads=THREADS, model_type="nemo_transducer", decoding_method="greedy_search")

    def transcribe(self, pcm: np.ndarray) -> str:
        s = self.rec.create_stream()
        s.accept_waveform(SR, pcm)
        self.rec.decode_stream(s)
        return s.result.text.strip()


_models: dict[str, object] = {}
_locks = {"en": threading.Lock(), "kn": threading.Lock()}
MODEL_INFO = {
    "en": {"name": "NVIDIA Parakeet TDT 0.6B v2", "licence": "CC-BY-4.0", "dir": "parakeet-en", "check": "encoder.int8.onnx"},
    "kn": {"name": "AI4Bharat IndicConformer 600M", "licence": "MIT", "dir": "indicconformer-kn", "check": "onnx/encoder_quantized_int8.onnx"},
}


def available() -> dict:
    d = speech_dir()
    return {lang: (d / i["dir"] / i["check"]).exists() for lang, i in MODEL_INFO.items()}


def transcribe(lang: str, wav_bytes: bytes) -> dict:
    """Blocking; call from a worker thread."""
    if lang not in MODEL_INFO:
        raise ValueError("Voice input supports English and Kannada.")
    if not available()[lang]:
        raise FileNotFoundError("The speech model is not installed. Run scripts\\download_speech.py.")
    pcm = read_wav(wav_bytes)
    secs = len(pcm) / SR
    if secs < 0.3:
        return {"text": "", "audio_s": round(secs, 2), "took_s": 0.0}
    with _locks[lang]:
        t0 = time.perf_counter()
        if lang not in _models:
            d = speech_dir() / MODEL_INFO[lang]["dir"]
            _models[lang] = _English(d) if lang == "en" else _Kannada(d)
        text = _models[lang].transcribe(pcm)
        return {"text": text, "audio_s": round(secs, 2), "took_s": round(time.perf_counter() - t0, 2),
                "model": MODEL_INFO[lang]["name"]}


def preload(min_free_gb: float = 3.0) -> list[str]:
    """Load installed speech models ahead of the first student, only if memory allows (blocking)."""
    import psutil
    done = []
    for lang in ("en", "kn"):
        if not available()[lang] or lang in _models:
            continue
        if psutil.virtual_memory().available / 1073741824 < min_free_gb:
            break
        with _locks[lang]:
            d = speech_dir() / MODEL_INFO[lang]["dir"]
            _models[lang] = _English(d) if lang == "en" else _Kannada(d)
        done.append(lang)
    return done
