#!/usr/bin/env python3
"""Generate a depth map per still with Depth Anything V2 (small) via onnxruntime.
CPU-only, works on darwin-x64 (onnxruntime 1.19.2 universal2 wheel). No PyTorch/GPU.
The depth PNG feeds Depth3D.tsx (Three.js displacement plane) for real 2.5D camera moves.

  .venv/bin/python gen_depth.py <publicDir> [singleFile]

Writes <name>_depth.png next to each image. Resumable (skips existing).
"""
import sys, os, urllib.request
import numpy as np
from PIL import Image
import onnxruntime as ort

PUB = sys.argv[1] if len(sys.argv) > 1 else "../../longform-studio/public"
ONLY = sys.argv[2] if len(sys.argv) > 2 else None

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "..", "models"))
MODEL_PATH = os.path.join(MODEL_DIR, "depth_anything_v2_small_q.onnx")
# quantized (uint8, ~27MB) — smaller + faster on CPU than the 99MB fp32 model
MODEL_URL = "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx"
MIN_BYTES = 20_000_000  # guard against truncated downloads
SIZE = 518  # Depth Anything V2 input size (multiple of 14)

def ensure_model():
    os.makedirs(MODEL_DIR, exist_ok=True)
    ok = os.path.exists(MODEL_PATH) and os.path.getsize(MODEL_PATH) >= MIN_BYTES
    if not ok:
        print(f"downloading depth model -> {MODEL_PATH}")
        # curl follows redirects + resumes; far more reliable than urlretrieve
        import subprocess
        subprocess.run(["curl", "-fL", "--retry", "3", "-o", MODEL_PATH, MODEL_URL], check=True)
    if os.path.getsize(MODEL_PATH) < MIN_BYTES:
        raise RuntimeError(f"model download too small ({os.path.getsize(MODEL_PATH)} bytes) — retry")
    return MODEL_PATH

def preprocess(img: Image.Image):
    im = img.convert("RGB").resize((SIZE, SIZE), Image.BICUBIC)
    a = np.asarray(im, dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    a = (a - mean) / std
    a = a.transpose(2, 0, 1)[None, ...]  # NCHW
    return a

def main():
    model = ensure_model()
    sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0].name

    files = [f for f in os.listdir(PUB)
             if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) and not f.endswith("_depth.png")]
    if ONLY:
        files = [f for f in files if f == ONLY]
    if not files:
        print("no images in", PUB); return

    made = skipped = 0
    for f in files:
        out = os.path.join(PUB, os.path.splitext(f)[0] + "_depth.png")
        if os.path.exists(out):
            skipped += 1; print("skip", os.path.basename(out)); continue
        img = Image.open(os.path.join(PUB, f))
        W, H = img.size
        d = sess.run(None, {inp: preprocess(img)})[0]      # (1,H,W) or (1,1,H,W)
        d = np.squeeze(d)
        d = (d - d.min()) / (d.max() - d.min() + 1e-6)      # 0..1, near=bright
        depth_img = Image.fromarray((d * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        depth_img.save(out)
        made += 1; print("OK", os.path.basename(out))
    print(f"\nDEPTHDONE made={made} skipped={skipped} in {PUB}")

if __name__ == "__main__":
    main()
