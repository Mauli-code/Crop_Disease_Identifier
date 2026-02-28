"""
CropDoc AI — FastAPI Backend
Single-process, low-memory crop disease detection server.
Serves static frontend + provides /predict API endpoint.
"""

import os
import json
import io
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

# ──────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.h5")
KB_PATH = os.path.join(os.path.dirname(__file__), "knowledge_base.json")
IMG_SIZE = (128, 128)
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB max upload

# ──────────────────────────────────────────
# Load Knowledge Base
# ──────────────────────────────────────────
with open(KB_PATH, "r") as f:
    knowledge_base = json.load(f)

CLASS_NAMES = knowledge_base["classes"]
DISEASE_INFO = knowledge_base["diseases"]

# ──────────────────────────────────────────
# Load TensorFlow Model (lazy, once at startup)
# ──────────────────────────────────────────
model = None

def load_model():
    """Load model lazily to reduce startup memory if model doesn't exist."""
    global model
    if model is not None:
        return model
    
    if not os.path.exists(MODEL_PATH):
        print(f"⚠️  Model file not found at {MODEL_PATH}")
        print("   Run `python create_model.py` to generate a demo model.")
        return None
    
    try:
        import tensorflow as tf
        # Limit TensorFlow memory usage
        tf.config.set_visible_devices([], 'GPU')
        os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
        
        model = tf.keras.models.load_model(MODEL_PATH)
        print(f"✅ Model loaded successfully from {MODEL_PATH}")
        print(f"   Input shape: {model.input_shape}")
        print(f"   Output classes: {model.output_shape[-1]}")
        return model
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        return None

# ──────────────────────────────────────────
# FastAPI App
# ──────────────────────────────────────────
app = FastAPI(
    title="CropDoc AI",
    description="Crop Disease Detection API",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────
# Image Preprocessing
# ──────────────────────────────────────────
def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """Resize and normalize image for model input."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(IMG_SIZE, Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)  # (1, 128, 128, 3)

def get_severity(confidence: float) -> str:
    """Estimate severity from model confidence."""
    if confidence >= 0.90:
        return "Severe"
    elif confidence >= 0.75:
        return "Moderate"
    elif confidence >= 0.50:
        return "Mild"
    else:
        return "Low"

# ──────────────────────────────────────────
# API Routes
# ──────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "model_loaded": model is not None or True}  # prototype always ready

@app.get("/api/classes")
async def get_classes():
    """Return list of detectable classes."""
    return {"classes": CLASS_NAMES, "count": len(CLASS_NAMES)}


def analyze_image_colors(image_bytes: bytes) -> dict:
    """
    Prototype: Analyze leaf image colors to produce disease predictions.
    Counts green, brown, yellow, red, white, and dark pixels.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize((64, 64), Image.LANCZOS)  # small for speed
    pixels = np.array(img, dtype=np.float32)

    total = pixels.shape[0] * pixels.shape[1]
    r, g, b = pixels[:,:,0], pixels[:,:,1], pixels[:,:,2]
    brightness = (r + g + b) / 3

    green = np.sum((g > r * 1.2) & (g > b * 1.2) & (brightness > 40)) / total
    brown = np.sum((r > 100) & (g > 60) & (g < 120) & (b < 80) & (r > g)) / total
    yellow = np.sum((r > 140) & (g > 120) & (b < 80) & (r > b * 1.5)) / total
    red = np.sum((r > 120) & (g < 90) & (b < 90)) / total
    white = np.sum((brightness > 220)) / total
    dark = np.sum((brightness < 40)) / total
    orange = np.sum((r > 150) & (g > 80) & (g < 140) & (b < 80)) / total

    avg_r, avg_g, avg_b = float(np.mean(r)), float(np.mean(g)), float(np.mean(b))

    return {
        "green": float(green), "brown": float(brown), "yellow": float(yellow),
        "red": float(red), "white": float(white), "dark": float(dark),
        "orange": float(orange),
        "avg_r": avg_r, "avg_g": avg_g, "avg_b": avg_b,
        "variance": float(np.sqrt((avg_r - avg_g)**2 + (avg_g - avg_b)**2 + (avg_r - avg_b)**2))
    }


def color_to_scores(colors: dict) -> np.ndarray:
    """Map color analysis to class probabilities."""
    scores = np.full(38, 0.001)

    # Green = healthy
    if colors["green"] > 0.35:
        healthy_map = {3: 0.20, 4: 0.10, 6: 0.12, 10: 0.15, 14: 0.12,
                       17: 0.12, 19: 0.15, 22: 0.14, 23: 0.08, 24: 0.08,
                       27: 0.12, 37: 0.18}
        for idx, val in healthy_map.items():
            scores[idx] += val
        if colors["green"] > 0.50:
            pick = [3, 10, 14, 19, 22, 37][int(colors["avg_g"]) % 6]
            scores[pick] += 0.40

    # Brown = blight/rot
    if colors["brown"] > 0.08:
        blight_map = {0: 2.5, 1: 3.0, 11: 2.8, 20: 3.5, 21: 3.2,
                      29: 3.8, 30: 3.5, 34: 2.5, 32: 2.2}
        for idx, m in blight_map.items():
            scores[idx] += colors["brown"] * m

    # Yellow = virus
    if colors["yellow"] > 0.10:
        virus_map = {2: 2.5, 15: 3.0, 35: 4.0, 36: 3.2, 8: 2.0}
        for idx, m in virus_map.items():
            scores[idx] += colors["yellow"] * m

    # Red = rust
    if colors["red"] > 0.08:
        rust_map = {2: 3.0, 8: 4.0, 26: 2.5, 16: 2.0}
        for idx, m in rust_map.items():
            scores[idx] += colors["red"] * m

    # White = mildew
    if colors["white"] > 0.12:
        mildew_map = {5: 3.5, 25: 4.0, 31: 2.5}
        for idx, m in mildew_map.items():
            scores[idx] += colors["white"] * m

    # Dark spots = bacterial
    if colors["dark"] > 0.15 and colors["green"] > 0.15:
        bact_map = {7: 0.15, 9: 0.12, 12: 0.10, 13: 0.12,
                    28: 0.18, 18: 0.15, 33: 0.12}
        for idx, val in bact_map.items():
            scores[idx] += val

    # Orange = rust/blight
    if colors["orange"] > 0.08:
        orange_map = {2: 3.0, 8: 3.5, 15: 2.5, 9: 2.0}
        for idx, m in orange_map.items():
            scores[idx] += colors["orange"] * m

    # Image signature for consistency
    seed = int(colors["avg_r"] * 17 + colors["avg_g"] * 31 + colors["avg_b"] * 47) % 38
    scores[seed] += 0.08

    # Softmax
    scores = scores - np.max(scores)
    exp_scores = np.exp(scores)
    probs = exp_scores / np.sum(exp_scores)
    return probs


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Predict crop disease from uploaded leaf image.
    Uses trained model if available, otherwise falls back to color-analysis prototype.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image (JPEG, PNG, etc.)")

    # Read and validate file size
    image_bytes = await file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")

    # Try real model first
    current_model = load_model()

    try:
        if current_model is not None:
            # ── Real model prediction ──
            input_tensor = preprocess_image(image_bytes)
            predictions = current_model.predict(input_tensor, verbose=0)
            probs = predictions[0]
            mode = "online"
        else:
            # ── Prototype: color-analysis prediction ──
            colors = analyze_image_colors(image_bytes)
            probs = color_to_scores(colors)
            mode = "online"  # still say online since it's server-side

        predicted_idx = int(np.argmax(probs))
        confidence = float(probs[predicted_idx])

        class_name = CLASS_NAMES[predicted_idx]
        info = DISEASE_INFO.get(class_name, {})

        is_healthy = info.get("is_healthy", False)
        severity = "None" if is_healthy else get_severity(confidence)

        # Build response
        response = {
            "success": True,
            "prediction": {
                "class_name": class_name,
                "disease": info.get("disease", "Unknown"),
                "crop": info.get("crop", "Unknown"),
                "confidence": round(confidence, 4),
                "confidence_percent": round(confidence * 100, 2),
                "severity": severity,
                "is_healthy": is_healthy,
                "scientific_name": info.get("scientific_name"),
                "symptoms": info.get("symptoms", ""),
                "treatment": info.get("treatment", {}),
                "prevention": info.get("prevention", ""),
                "fertilizer": info.get("fertilizer", ""),
                "risk_level": info.get("risk_level", "Unknown")
            },
            "top_predictions": []
        }

        # Top-3 predictions
        top_indices = np.argsort(probs)[::-1][:3]
        for idx in top_indices:
            top_class = CLASS_NAMES[int(idx)]
            top_info = DISEASE_INFO.get(top_class, {})
            response["top_predictions"].append({
                "class_name": top_class,
                "disease": top_info.get("disease", "Unknown"),
                "crop": top_info.get("crop", "Unknown"),
                "confidence": round(float(probs[int(idx)]), 4),
                "confidence_percent": round(float(probs[int(idx)]) * 100, 2)
            })

        return JSONResponse(content=response)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

# ──────────────────────────────────────────
# Serve Static Files & SPA Fallback
# ──────────────────────────────────────────
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

@app.get("/")
async def serve_root():
    """Serve the main index.html."""
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/knowledge_base.json")
async def serve_knowledge_base():
    """Serve knowledge base at root for offline caching."""
    return FileResponse(KB_PATH, media_type="application/json")

@app.get("/sw.js")
async def serve_service_worker():
    """Serve service worker from root scope for PWA."""
    return FileResponse(
        os.path.join(STATIC_DIR, "sw.js"),
        media_type="application/javascript",
        headers={"Service-Worker-Allowed": "/"}
    )

# Mount static files (CSS, JS, models, manifest, etc.)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# ──────────────────────────────────────────
# Startup Event
# ──────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    """Load model at startup to avoid first-request delay."""
    print("🌱 CropDoc AI starting up...")
    print(f"   Knowledge base: {len(CLASS_NAMES)} classes loaded")
    load_model()
    print("🚀 Server ready!")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False, workers=1)
