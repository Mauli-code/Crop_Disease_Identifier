# 🌿 CropDoc AI — Crop Disease Detection System

**Intelligent crop disease identification from leaf images using on-device AI.**

CropDoc AI is a hybrid web application that identifies crop diseases from leaf photographs, estimates severity levels, and provides actionable treatment recommendations — all powered by TensorFlow.js for offline capability.

---

## 🎯 Features

- **38 Disease Classes** — Covers the complete PlantVillage dataset across 14 crop species
- **Hybrid AI** — Server-side (FastAPI) + browser-side (TensorFlow.js) inference
- **Offline-First** — Works without internet after first load (PWA with service worker)
- **Camera Support** — Capture leaf photos directly from your device
- **Treatment Recommendations** — Organic & chemical treatment options
- **Severity Estimation** — Confidence-based severity assessment
- **Responsive Design** — Works on desktop, tablet, and mobile

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Generate Demo Model

```bash
python create_model.py
```

This creates:
- `model.h5` — Keras model for the backend
- `static/models/model.json` + shard files — TensorFlow.js model for browser

### 3. Run the Server

```bash
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

### 4. Open in Browser

Navigate to `http://localhost:8000`

---

## 📁 Project Structure

```
cropdoc-ai/
├── app.py                    # FastAPI backend server
├── model.h5                  # Keras model (generated)
├── create_model.py           # Model generation script
├── knowledge_base.json       # 38-class disease knowledge base
├── requirements.txt          # Python dependencies
├── .replit                   # Replit configuration
├── README.md
│
└── static/
    ├── index.html            # Main UI
    ├── css/style.css         # Premium dark theme
    ├── js/
    │   ├── app.js            # Main app controller
    │   ├── offline.js        # TF.js browser inference
    │   ├── online.js         # API client
    │   └── preprocess.js     # Image preprocessing
    ├── models/               # TF.js model files (generated)
    │   ├── model.json
    │   └── *.bin
    ├── manifest.json         # PWA manifest
    └── sw.js                 # Service worker
```

---

## 🔬 How It Works

### Hybrid Architecture

```
User uploads leaf image
        │
        ├─ Online? ──→ POST /predict (FastAPI + TensorFlow)
        │                    │
        │                    ├─ Success → Show results
        │                    └─ Fail → Fallback to offline
        │
        └─ Offline? ──→ TensorFlow.js (in-browser)
                              │
                              └─ Local knowledge_base.json → Show results
```

### Supported Crops & Diseases

| Crop | Diseases Detected |
|------|-------------------|
| Apple | Apple Scab, Black Rot, Cedar Apple Rust |
| Cherry | Powdery Mildew |
| Corn | Gray Leaf Spot, Common Rust, Northern Leaf Blight |
| Grape | Black Rot, Esca, Leaf Blight |
| Orange | Huanglongbing (Citrus Greening) |
| Peach | Bacterial Spot |
| Pepper | Bacterial Spot |
| Potato | Early Blight, Late Blight |
| Squash | Powdery Mildew |
| Strawberry | Leaf Scorch |
| Tomato | Bacterial Spot, Early Blight, Late Blight, Leaf Mold, Septoria Leaf Spot, Spider Mites, Target Spot, Yellow Leaf Curl Virus, Mosaic Virus |

Plus healthy detection for: Apple, Blueberry, Cherry, Corn, Grape, Peach, Pepper, Potato, Raspberry, Soybean, Strawberry, Tomato.

---

## 🔧 Training a Production Model

The included demo model uses **random weights**. For accurate predictions:

1. Download the [PlantVillage dataset](https://www.kaggle.com/datasets/emmarex/plantdisease) from Kaggle
2. Train the MobileNetV2 architecture on the dataset:
   ```python
   # The create_model.py script creates the correct architecture
   # Add training code with your dataset
   base_model = tf.keras.applications.MobileNetV2(
       input_shape=(128, 128, 3),
       include_top=False,
       weights='imagenet',  # Use pretrained ImageNet weights
       alpha=0.35
   )
   ```
3. Replace `model.h5` with your trained model
4. Re-run `python create_model.py` (comment out model creation, keep conversion)

Expected accuracy with proper training: **~95%+** on PlantVillage validation set.

---

## ⚙️ API Reference

### `POST /predict`
Upload a leaf image for disease prediction.

**Request:** `multipart/form-data` with `file` field

**Response:**
```json
{
    "success": true,
    "prediction": {
        "disease": "Late Blight",
        "crop": "Tomato",
        "confidence": 0.9234,
        "severity": "Severe",
        "is_healthy": false,
        "treatment": { "organic": "...", "chemical": "..." },
        "prevention": "...",
        "fertilizer": "...",
        "risk_level": "Critical"
    },
    "top_predictions": [...]
}
```

### `GET /api/health`
Server health check.

### `GET /api/classes`
List all 38 detectable classes.

---

## 📜 License

Open source for educational and agricultural development purposes.
