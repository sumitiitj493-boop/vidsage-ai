import tempfile
import subprocess


def preprocess_audio(input_path: str, enhance_audio: bool = False) -> str:
    """
    Preprocess audio for Whisper ASR:
    1. Convert to mono, 16kHz, 16-bit WAV
    2. Normalize loudness + optional denoise
    Returns path to preprocessed file.
    """
    print("[Preprocessing] Converting audio to mono 16kHz WAV...", flush=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:       
        output_path = tmp.name

    audio_filter = "afftdn,loudnorm" if enhance_audio else "loudnorm"

    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-ac", "1",
        "-ar", "16000",
        "-sample_fmt", "s16",
        "-af", audio_filter,
        output_path,
    ]

    try:
        subprocess.run(
            ffmpeg_cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
            timeout=120
        )
    except subprocess.CalledProcessError:
        raise RuntimeError("FFmpeg failed to preprocess audio.")
    except subprocess.TimeoutExpired:
        raise RuntimeError("FFmpeg timed out while preprocessing audio.")

    print("[Preprocessing] Done! Starting transcription...", flush=True)
    return output_path
