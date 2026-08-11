"""asset_processor.py

Modular Minimalist Video Editing Agent - Dynamic Asset Pipeline.

Per skill spec (sections 2 & 5):
  1. Parse a script transcript JSON.
  2. Cache-check assets/ for already-processed entity PNGs.
  3. Dynamically download high-res real images/logos for mentioned entities.
  4. Strip backgrounds with `rembg`.
  5. Save processed transparent PNGs into assets/ for the Remotion renderer.
  6. Generate narration audio via ElevenLabs and save into assets/.
  7. Save per-word transcript alignment JSON for kinetic typography sync.

Usage:
  python3 scripts/asset_processor.py --transcript core_assets/transcript.json

Env vars / flags:
  --eleven-key   ElevenLabs API key (or ELEVENLABS_API_KEY)
  --rembg-model  rembg model name (default: u2net)
"""

import argparse
import json
import os
import shutil
import subprocess
import sys

# ----------------------------------------------------------------------------
# Paths
# ----------------------------------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(ROOT, "assets")
EXPORT_DIR = os.path.join(ROOT, "export")
os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)


# ----------------------------------------------------------------------------
# 1. Voice generation (ElevenLabs)
# ----------------------------------------------------------------------------
def generate_voice(text, api_key, voice_id="default", output_name="narration.mp3"):
    """Generate narration audio via ElevenLabs and save directly into assets/."""
    try:
        import requests
    except ImportError:
        sys.exit("Missing dependency 'requests'. Run: pip install requests")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "accept": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.5},
    }

    resp = requests.post(url, json=payload, headers=headers)
    resp.raise_for_status()
    data = resp.json()

    output_path = os.path.join(ASSETS_DIR, output_name)
    with open(output_path, "wb") as f:
        f.write(bytes(data["audio_base64"], "utf-8") if False else _b64(data["audio_base64"]))

    # Persist word-level timestamps for kinetic typography alignment.
    alignment_path = os.path.join(ASSETS_DIR, "transcript_alignment.json")
    with open(alignment_path, "w", encoding="utf-8") as f:
        json.dump(data.get("alignment", {}), f, indent=2)

    return output_path, alignment_path


def _b64(s):
    import base64
    return base64.b64decode(s)


# ----------------------------------------------------------------------------
# 2. Background removal (rembg) + dynamic download
# ----------------------------------------------------------------------------
def download_image(image_url, dest_path):
    try:
        import requests
    except ImportError:
        sys.exit("Missing dependency 'requests'. Run: pip install requests")
    resp = requests.get(image_url, stream=True, timeout=30)
    resp.raise_for_status()
    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(8192):
            f.write(chunk)
    return dest_path


def remove_bg(input_path, output_path, model_name="u2net"):
    """Strip background using the `rembg` CLI utility."""
    if shutil.which("rembg") is None:
        sys.exit("Missing 'rembg'. Run: pip install rembg onnxruntime")
    cmd = ["rembg", "i", "-m", model_name, input_path, output_path]
    subprocess.run(cmd, check=True)
    return output_path


def ensure_entity_png(entity, search_url, rembg_model="u2net"):
    """Cache-check then download + strip background for a transcript entity."""
    safe = "".join(c if c.isalnum() else "_" for c in entity).lower()
    cached = os.path.join(ASSETS_DIR, f"{safe}.png")
    if os.path.exists(cached):
        print(f"[cache] {entity} -> {cached}")
        return cached

    raw = os.path.join(ASSETS_DIR, f"{safe}_raw.png")
    download_image(search_url, raw)
    remove_bg(raw, cached, rembg_model)
    os.remove(raw)
    print(f"[new]   {entity} -> {cached}")
    return cached


# ----------------------------------------------------------------------------
# 3. Transcript-driven pipeline
# ----------------------------------------------------------------------------
def process_transcript(transcript_path, eleven_key, rembg_model):
    with open(transcript_path, "r", encoding="utf-8") as f:
        transcript = json.load(f)

    script_text = transcript.get("text", "")
    entities = transcript.get("entities", [])

    # Generate narration + alignment if a key is provided.
    if eleven_key:
        audio, alignment = generate_voice(script_text, eleven_key, output_name="narration.mp3")
        print(f"[voice] {audio}")
        print(f"[align] {alignment}")
    else:
        print("[voice] skipped (no ElevenLabs key)")

    # Resolve every mentioned entity image.
    for ent in entities:
        name = ent.get("name")
        url = ent.get("image_url")
        if name and url:
            ensure_entity_png(name, url, rembg_model)

    print("[done] assets ready in", ASSETS_DIR)


def main():
    ap = argparse.ArgumentParser(description="Dynamic asset processor for Remotion pipeline")
    ap.add_argument("--transcript", required=True, help="Path to transcript JSON")
    ap.add_argument("--eleven-key", default=os.environ.get("ELEVENLABS_API_KEY", ""))
    ap.add_argument("--rembg-model", default="u2net")
    args = ap.parse_args()

    process_transcript(args.transcript, args.eleven_key, args.rembg_model)


if __name__ == "__main__":
    main()
