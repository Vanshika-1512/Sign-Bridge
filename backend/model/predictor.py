"""
backend/model/predictor.py
--------------------------
GesturePredictor — Sign MNIST pixel-based model.

The frontend sends a base64-encoded 28x28 grayscale hand crop.
We decode → normalize → PCA → predict.
Falls back to rule-based if no model files are found.
"""
import pickle
from pathlib import Path
import numpy as np

MODEL_DIR   = Path(__file__).parent.parent.parent / "model" / "weights"
MODEL_PATH  = MODEL_DIR / "asl_classifier.pkl"
SCALER_PATH = MODEL_DIR / "scaler.pkl"
PCA_PATH    = MODEL_DIR / "pca.pkl"
LABEL_PATH  = MODEL_DIR / "label_map.pkl"

# label int → ASL letter (skipping 9=J, 25=Z)
DEFAULT_LABEL_MAP = {i: chr(65 + i) for i in range(26) if i not in [9, 25]}
ASL_CLASSES = list("ABCDEFGHIKLMNOPQRSTUVWXY")


class GesturePredictor:
    def __init__(self):
        self.model     = None
        self.scaler    = None
        self.pca       = None
        self.label_map = DEFAULT_LABEL_MAP
        self.is_loaded = False
        self.model_type = "rule"
        self._load()

    def _load(self):
        if not MODEL_PATH.exists():
            print("ℹ️  No trained model — using rule-based fallback.")
            return
        try:
            with open(MODEL_PATH,  "rb") as f: self.model  = pickle.load(f)
            with open(SCALER_PATH, "rb") as f: self.scaler = pickle.load(f)
            if PCA_PATH.exists():
                with open(PCA_PATH, "rb") as f: self.pca = pickle.load(f)
            if LABEL_PATH.exists():
                with open(LABEL_PATH, "rb") as f: self.label_map = pickle.load(f)
            self.is_loaded  = True
            self.model_type = "pixel"
            dims = self.pca.n_components_ if self.pca else "none"
            print(f"✅ Sign MNIST model loaded  |  PCA dims: {dims}")
        except Exception as e:
            print(f"⚠️  Model load error: {e}  →  rule-based fallback")

    # ── Primary: predict from 28x28 pixel array ───────────
    def predict_from_pixels(self, pixels: np.ndarray) -> dict:
        """
        pixels : (28,28) uint8  OR  (784,) float
        Returns { letter, confidence, alternatives }
        """
        flat = pixels.flatten().astype(np.float32)
        if flat.max() > 1.0:
            flat /= 255.0
        return self._run(flat.reshape(1, -1))

    # ── Called by WebSocket/REST with landmark coords ──────
    def predict(self, landmarks: np.ndarray) -> dict:
        """
        landmarks : (21, 3) float  — MediaPipe normalised coords.
        Converts to a 28x28 skeleton image then classifies.
        NOTE: accuracy is lower than real-image input because the
        training data (Sign MNIST) contains real hand photos.
        For best accuracy use the /api/predict-image endpoint
        which accepts a real webcam crop.
        """
        if self.model_type == "pixel":
            img = self._landmarks_to_image(landmarks)
            return self.predict_from_pixels(img)
        return self._rule_predict(landmarks)

    # ── Internal: run sklearn pipeline ────────────────────
    def _run(self, X: np.ndarray) -> dict:
        try:
            if self.scaler: X = self.scaler.transform(X)
            if self.pca:    X = self.pca.transform(X)
            proba   = self.model.predict_proba(X)[0]
            classes = self.model.classes_
            top     = np.argsort(proba)[::-1]
            letter  = self.label_map.get(int(classes[top[0]]),
                                         chr(65 + int(classes[top[0]])))
            conf    = float(proba[top[0]])
            alts    = [{"letter": self.label_map.get(int(classes[i]),
                                                     chr(65 + int(classes[i]))),
                        "confidence": round(float(proba[i]), 3)}
                       for i in top[1:4]]
            return {"letter": letter if conf > 0.35 else None,
                    "confidence": round(conf, 3),
                    "alternatives": alts}
        except Exception as e:
            return {"letter": None, "confidence": 0.0,
                    "alternatives": [], "error": str(e)}

    # ── Convert MediaPipe landmarks → 28x28 image ─────────
    def _landmarks_to_image(self, landmarks: np.ndarray, size: int = 28) -> np.ndarray:
        try:
            import cv2
        except ImportError:
            return np.zeros((size, size), dtype=np.uint8)

        img    = np.zeros((size, size), dtype=np.uint8)
        xs, ys = landmarks[:, 0], landmarks[:, 1]
        mn_x, mx_x = xs.min(), xs.max()
        mn_y, mx_y = ys.min(), ys.max()
        span   = max(mx_x - mn_x, mx_y - mn_y) + 1e-6
        margin = 3

        def px(x, y):
            r = int((x - mn_x) / span * (size - 2 * margin)) + margin
            c = int((y - mn_y) / span * (size - 2 * margin)) + margin
            return (np.clip(r, 0, size-1), np.clip(c, 0, size-1))

        CONNS = [(0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),
                 (0,9),(9,10),(10,11),(11,12),(0,13),(13,14),(14,15),(15,16),
                 (0,17),(17,18),(18,19),(19,20),(5,9),(9,13),(13,17)]
        pts = [px(landmarks[i, 0], landmarks[i, 1]) for i in range(21)]
        for a, b in CONNS:
            cv2.line(img, pts[a], pts[b], 180, 1)
        for i, pt in enumerate(pts):
            cv2.circle(img, pt, 2 if i in [4,8,12,16,20] else 1, 255, -1)
        return img

    # ── Rule-based fallback ────────────────────────────────
    def _rule_predict(self, landmarks: np.ndarray) -> dict:
        lm = self._norm(landmarks)

        def ext(ids):  return lm[ids[3]][1] < lm[ids[1]][1] - 0.02
        def curl(ids): return lm[ids[3]][1] > lm[ids[0]][1] - 0.01
        def d(a, b):   return float(np.linalg.norm(lm[a] - lm[b]))

        th = lm[4][0] < lm[2][0] - 0.04
        ie, me = ext([5,6,7,8]),  ext([9,10,11,12])
        re, pe = ext([13,14,15,16]), ext([17,18,19,20])
        ic, mc = curl([5,6,7,8]), curl([9,10,11,12])
        rc, pc = curl([13,14,15,16]), curl([17,18,19,20])
        pin = d(4,8) < 0.12
        aC  = ic and mc and rc and pc
        aE  = ie and me and re and pe

        rules = [
            (aC and th and not pin,                             'A', 0.88),
            (aE and not th,                                     'B', 0.88),
            (ie and not me and not re and not pe and th,        'L', 0.90),
            (not ie and not me and not re and pe and not th,    'I', 0.88),
            (th and ic and mc and rc and pe,                    'Y', 0.89),
            (ie and me and not re and not pe and d(8,12)>0.12, 'V', 0.87),
            (pin and me and re and pe,                          'F', 0.85),
            (aC and not th and lm[4][1] < lm[7][1],            'S', 0.84),
            (ie and me and not re and not pe and d(8,12)<0.07, 'U', 0.85),
        ]
        for cond, letter, conf in rules:
            if cond:
                return {"letter": letter, "confidence": conf, "alternatives": []}
        return {"letter": None, "confidence": 0.0, "alternatives": []}

    def _norm(self, lm: np.ndarray) -> np.ndarray:
        w = lm[0].copy()
        n = lm - w
        s = np.max(np.linalg.norm(n, axis=1)) + 1e-6
        return n / s
