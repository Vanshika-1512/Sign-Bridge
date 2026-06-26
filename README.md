# ✦ SignBridge — Real-Time Sign Language Translator

> Bridging the gap between hands and words using computer vision and deep learning.

SignBridge translates American Sign Language (ASL) hand gestures into English text in real time, running directly in your browser using MediaPipe and a lightweight ML classifier.

---

## 🚀 Quick Start (Frontend Only — No Backend Needed)

The frontend runs entirely in-browser with no installation required:

```bash
# Clone the repo
git clone https://github.com/yourname/signbridge.git
cd signbridge

# Serve the frontend (any static server works)
cd frontend
npx serve .
# or
python -m http.server 8080
```

Open `http://localhost:8080` and click **Start Camera**.

> **No backend?** The frontend uses a built-in rule-based gesture classifier. For ML-powered predictions, run the Python backend (see below).

---

## 🗂 Project Structure

```
signbridge/
├── frontend/                    # Browser app (HTML/CSS/JS)
│   ├── index.html               # Home page
│   ├── pages/
│   │   ├── translator.html      # Main translator UI
│   │   ├── about.html           # About & tech explainer
│   │   └── contact.html         # Contact/feedback form
│   └── assets/
│       ├── css/
│       │   ├── main.css         # Design system & shared styles
│       │   ├── home.css         # Home page styles
│       │   ├── translator.css   # Translator page styles
│       │   └── pages.css        # About & contact styles
│       └── js/
│           ├── nav.js           # Navigation behavior
│           ├── home.js          # Home page animations
│           ├── gesture-classifier.js  # Rule-based ASL classifier
│           └── translator.js    # Core webcam + detection logic
│
├── backend/                     # Python FastAPI backend
│   ├── main.py                  # FastAPI app, REST + WebSocket endpoints
│   ├── model/
│   │   └── predictor.py         # ML model loader & inference
│   └── signbridge.db            # SQLite database (auto-created)
│
├── model/                       # ML training pipeline
│   ├── train.py                 # Train ASL classifier (MLP / RF)
│   ├── collect_data.py          # Webcam data collection tool
│   ├── dataset/
│   │   └── landmarks.csv        # Training data (63 features + label)
│   └── weights/
│       ├── asl_classifier.pkl   # Trained model (after training)
│       └── scaler.pkl           # Feature scaler
│
├── requirements.txt             # Python dependencies
└── README.md
```

---

## ⚙️ Backend Setup (Optional — for ML Inference)

### Prerequisites
- Python 3.10+
- Webcam (for data collection)

### Install

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Run the backend

```bash
cd backend
python main.py
# → API running at http://localhost:8000
# → Docs at http://localhost:8000/docs
```

The frontend will automatically detect and use the backend if it's running on `localhost:8000`.

---

## 🧠 Training Your Own Model

### Step 1: Collect landmark data

```bash
python model/collect_data.py --output model/dataset/landmarks.csv --target 200
```

Controls:
| Key | Action |
|-----|--------|
| `A`–`Z` | Select current label |
| `SPACE` | Toggle auto-capture |
| `S` | Save dataset |
| `Q` / `ESC` | Quit |

Aim for **200+ samples per letter** with varied:
- Lighting conditions
- Hand sizes / skin tones
- Camera distances (30–80 cm)

### Step 2: Train the model

```bash
# MLP neural network (recommended)
python model/train.py \
  --data model/dataset/landmarks.csv \
  --output model/weights/ \
  --model mlp

# Or: Random Forest (faster training, slightly lower accuracy)
python model/train.py \
  --data model/dataset/landmarks.csv \
  --output model/weights/ \
  --model rf
```

Expected accuracy with 200 samples/class: **~95–97%**

### Step 3: Restart backend

```bash
cd backend && python main.py
```

The backend will automatically load the new model from `model/weights/asl_classifier.pkl`.

---

## 🌐 API Reference

### `GET /api/health`
Health check — returns model load status.

### `POST /api/predict`
Classify a single gesture from landmark data.

**Request:**
```json
{
  "landmarks": [x0, y0, z0, x1, y1, z1, ..., x20, y20, z20]
}
```
*(63 float values — 21 landmarks × 3 coordinates)*

**Response:**
```json
{
  "letter": "A",
  "confidence": 0.97,
  "alternatives": [
    { "letter": "S", "confidence": 0.02 },
    { "letter": "E", "confidence": 0.01 }
  ],
  "inference_ms": 1.2
}
```

### `WebSocket /ws/predict`
Real-time inference. Send/receive same JSON format as REST endpoint.

### `GET /api/translations`
Get translation history (up to 20 entries).

### `POST /api/translations`
Save a completed translation: `{ "text": "HELLO WORLD" }`

### `POST /api/feedback`
Submit contact form feedback.

---

## 🎯 How It Works

```
Webcam Frame
    ↓
MediaPipe Hands (WebAssembly)
    ↓
21 × 3D Hand Landmarks
    ↓
Normalize (wrist-relative, scale-invariant)
    ↓
Rule-based Classifier  ──OR──  ML Model (backend)
    ↓
ASL Letter + Confidence Score
    ↓
Text Builder + TTS Output
```

**MediaPipe** runs at 30fps in-browser via WebAssembly — no video leaves your device.

**The classifier** maps a 63-dimensional normalized landmark vector to one of 24 static ASL letters (J and Z require motion, not yet supported).

---

## ♿ Accessibility

- WCAG AA colour contrast throughout
- Keyboard shortcuts: `SPACE` (add space), `Backspace` (delete), `Enter` (speak)
- Screen reader announcements for status changes
- Large touch targets (minimum 44×44px)
- Responsive layout for mobile and tablet

---

## 🚀 Deployment

### Frontend → Netlify / Vercel

```bash
# Netlify
npm install -g netlify-cli
netlify deploy --dir=frontend --prod

# Vercel
npm install -g vercel
vercel frontend/
```

### Backend → Render / Railway

1. Push to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Update `API_BASE` in `frontend/assets/js/translator.js` with your Render URL

---

## 📊 Dataset

The model can be trained on:

| Dataset | Source | Notes |
|---------|--------|-------|
| ASL Alphabet | [Kaggle](https://www.kaggle.com/grassknoted/asl-alphabet) | 87K images, 29 classes |
| ASL Dataset | [Roboflow](https://universe.roboflow.com/david-lee-d0rhs/american-sign-language-letters) | Landmark-extracted |
| Custom | `model/collect_data.py` | Your own webcam data |

For best results, extract MediaPipe landmarks from images rather than training on raw pixels.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JS |
| Computer Vision | MediaPipe Hands (WebAssembly) |
| ML (client) | Rule-based landmark classifier |
| ML (server) | scikit-learn MLP / Random Forest |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Real-time | WebSockets |
| Database | SQLite |
| TTS | Web Speech API |
| Deployment | Netlify (frontend), Render (backend) |

---

## 🤝 Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m 'Add feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

We especially welcome:
- Diverse gesture training data (varied skin tones, hand sizes)
- ISL (Indian Sign Language) support
- Dynamic gesture support (J, Z)
- Improved accuracy on edge cases

---

## 📄 License

MIT — free to use, modify, and distribute.

---

*Built with ❤️ for accessibility. Communication is a human right.*
