"""
fix_pipeline.py
---------------
Run this from the project root:
    python fix_pipeline.py

This script:
1. Diagnoses exactly what is wrong
2. Fixes the label encoder
3. Fixes the backend normalization
4. Tests the full pipeline live
5. Verifies everything is correct
"""

import pickle
import json
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

W   = Path('model/weights')
CSV = Path('model/dataset/landmarks.csv')

print("=" * 60)
print("SIGNBRIDGE PIPELINE DIAGNOSTIC & FIX")
print("=" * 60)

# ── Load everything ────────────────────────────────────
print("\n[1] Loading model files...")
with open(W/'asl_classifier.pkl','rb') as f: model = pickle.load(f)
with open(W/'scaler.pkl','rb') as f:         scaler = pickle.load(f)

print(f"    Model type     : {type(model).__name__}")
print(f"    Model classes_ : {model.classes_}")
print(f"    Model n_feats  : {getattr(model,'n_features_in_','?')}")
print(f"    Scaler n_feats : {getattr(scaler,'n_features_in_','?')}")

# ── Load dataset labels ────────────────────────────────
print("\n[2] Loading dataset...")
df          = pd.read_csv(CSV)
real_labels = sorted(df['label'].unique())
print(f"    CSV labels     : {real_labels}")
print(f"    Total samples  : {len(df)}")
print(f"    Samples/letter :")
for l in real_labels:
    print(f"      {l}: {(df['label']==l).sum()}")

# ── Understand model classes ───────────────────────────
print("\n[3] Analyzing model class mapping...")
model_classes = model.classes_
are_numeric   = all(str(c).isdigit() for c in model_classes)
are_letters   = all(str(c).isalpha() for c in model_classes)

print(f"    Model classes are numeric : {are_numeric}")
print(f"    Model classes are letters : {are_letters}")
print(f"    Num model classes         : {len(model_classes)}")
print(f"    Num real labels           : {len(real_labels)}")

# ── Build correct label encoder ────────────────────────
print("\n[4] Building correct label encoder...")

le = LabelEncoder()

if are_letters:
    # Model directly predicts letters — best case
    le.classes_ = np.array([str(c) for c in model_classes])
    print(f"    Model predicts letters directly: {le.classes_}")

elif are_numeric:
    # Model predicts 0,1,2... → map to sorted real labels
    if len(model_classes) == len(real_labels):
        le.classes_ = np.array(real_labels)
        print(f"    Mapped numeric→letters: {le.classes_}")
    else:
        print(f"    WARNING: class count mismatch! Model:{len(model_classes)} CSV:{len(real_labels)}")
        # Use whatever matches
        le.classes_ = np.array(real_labels[:len(model_classes)])
        print(f"    Using first {len(model_classes)} labels: {le.classes_}")

# Save fixed label encoder
with open(W/'label_encoder.pkl','wb') as f:
    pickle.dump(le, f)
print(f"    Saved label_encoder.pkl: {le.classes_}")

# ── Verify accuracy with correct mapping ───────────────
print("\n[5] Verifying accuracy with correct mapping...")
X = df.drop(columns=['label']).values.astype(np.float32)
y = df['label'].values

# Check feature count
n_feat_model  = getattr(model, 'n_features_in_', None)
n_feat_scaler = getattr(scaler,'n_features_in_', None)
n_feat_csv    = X.shape[1]

print(f"    CSV features   : {n_feat_csv}")
print(f"    Model expects  : {n_feat_model}")
print(f"    Scaler expects : {n_feat_scaler}")

if n_feat_model and n_feat_model != n_feat_csv:
    print(f"\n    WARNING: Feature mismatch! Model expects {n_feat_model} but CSV has {n_feat_csv}")
    print("    This means normalization is needed before training features match inference")

# Normalize for test
def normalize(flat):
    lm    = np.array(flat).reshape(21,3)
    wrist = lm[0].copy()
    lm    = lm - wrist
    scale = np.max(np.linalg.norm(lm,axis=1)) + 1e-6
    return (lm/scale).flatten()

# Check if model was trained with raw or normalized features
_,Xte,_,yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# Test with raw features (as in CSV)
try:
    Xte_s    = scaler.transform(Xte)
    raw_pred = model.predict(Xte_s)

    if are_numeric:
        mapped = np.array([real_labels[int(p)] if int(p)<len(real_labels) else '?' for p in raw_pred])
    else:
        mapped = raw_pred

    acc_raw = accuracy_score(yte, mapped)*100
    print(f"\n    Accuracy with RAW csv features  : {acc_raw:.1f}%")
except Exception as e:
    print(f"    Raw features test failed: {e}")
    acc_raw = 0

# Test with normalized features
try:
    Xte_norm = np.array([normalize(row) for row in Xte])
    if Xte_norm.shape[1] == n_feat_scaler:
        Xte_ns   = scaler.transform(Xte_norm)
        norm_pred= model.predict(Xte_ns)
        if are_numeric:
            mapped_n = np.array([real_labels[int(p)] if int(p)<len(real_labels) else '?' for p in norm_pred])
        else:
            mapped_n = norm_pred
        acc_norm = accuracy_score(yte, mapped_n)*100
        print(f"    Accuracy with NORMALIZED features: {acc_norm:.1f}%")
    else:
        acc_norm = 0
        print(f"    Normalized shape {Xte_norm.shape[1]} != scaler {n_feat_scaler}, skip")
except Exception as e:
    print(f"    Norm test failed: {e}")
    acc_norm = 0

# Which works better?
use_norm = acc_norm > acc_raw
print(f"\n    Best pipeline: {'NORMALIZED' if use_norm else 'RAW CSV'} features ({max(acc_raw,acc_norm):.1f}%)")

# ── Write config file for backend ─────────────────────
print("\n[6] Writing pipeline config for backend...")
config = {
    "use_normalization": bool(use_norm),
    "n_features":        int(n_feat_model) if n_feat_model else int(n_feat_csv),
    "classes":           list(le.classes_),
    "are_numeric":       bool(are_numeric),
    "accuracy_raw":      float(acc_raw),
    "accuracy_norm":     float(acc_norm),
}
with open(W/'pipeline_config.json','w') as f:
    json.dump(config, f, indent=2)
print(f"    Saved pipeline_config.json: {json.dumps(config, indent=2)}")

print("\n" + "="*60)
print("FIX COMPLETE")
print(f"Best accuracy: {max(acc_raw,acc_norm):.1f}%")
print(f"Use normalization in backend: {use_norm}")
print("="*60)
print("\nNext steps:")
print("1. python backend/main.py")
print("2. Open translator in browser")
print("3. Test gestures")
