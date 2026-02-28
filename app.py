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
    return {"status": "ok", "model_loaded": model is not None}

@app.get("/api/classes")
async def get_classes():
    """Return list of detectable classes."""
    return {"classes": CLASS_NAMES, "count": len(CLASS_NAMES)}

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Predict crop disease from uploaded leaf image.
    Returns disease, confidence, severity, treatment, prevention, fertilizer, and risk_level.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image (JPEG, PNG, etc.)")
    
    # Read and validate file size
    image_bytes = await file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    
    # Load model if needed
    current_model = load_model()
    if current_model is None:
        raise HTTPException(
            status_code=503,
            detail="Model not available. Run `python create_model.py` to generate the model."
        )
    
    try:
        # Preprocess
        input_tensor = preprocess_image(image_bytes)
        
        # Predict
        predictions = current_model.predict(input_tensor, verbose=0)
        predicted_idx = int(np.argmax(predictions[0]))
        confidence = float(predictions[0][predicted_idx])
        
        # Get class name and disease info
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
        
        # Add top-3 predictions
        top_indices = np.argsort(predictions[0])[::-1][:3]
        for idx in top_indices:
            top_class = CLASS_NAMES[idx]
            top_info = DISEASE_INFO.get(top_class, {})
            response["top_predictions"].append({
                "class_name": top_class,
                "disease": top_info.get("disease", "Unknown"),
                "crop": top_info.get("crop", "Unknown"),
                "confidence": round(float(predictions[0][idx]), 4),
                "confidence_percent": round(float(predictions[0][idx]) * 100, 2)
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
