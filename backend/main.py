"""
backend/main.py — SignBridge FINAL v9
Letter model + Word model, properly separated.
"""
import json, pickle, sqlite3, time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BASE    = Path(__file__).parent.parent
W       = BASE / "model" / "weights"
DB_PATH = Path(__file__).parent / "signbridge.db"
ASL     = list("ABCDEFGHIKLMNOPQRSTUVWXY")

# Letter model
ltr_model=None; ltr_scaler=None; ltr_le=None
ltr_loaded=False; ltr_info="Not loaded"
ltr_use_norm=False; real_labels=[]

# Word model
wrd_model=None; wrd_scaler=None; wrd_le=None
wrd_loaded=False; wrd_classes=[]


def normalize(flat):
    lm=np.array(flat,dtype=np.float32).reshape(21,3)
    w=lm[0].copy(); lm=lm-w
    sc=np.max(np.linalg.norm(lm,axis=1))+1e-6
    return (lm/sc).flatten()


def load_letter_model():
    global ltr_model,ltr_scaler,ltr_le,ltr_loaded,ltr_info,ltr_use_norm,real_labels
    cfg_p=W/'pipeline_config.json'
    if cfg_p.exists():
        with open(cfg_p) as f: cfg=json.load(f)
        ltr_use_norm=cfg.get('use_normalization',False)
        real_labels =cfg.get('classes',ASL)
    else:
        ltr_use_norm=False; real_labels=ASL

    mp=W/'asl_classifier.pkl'
    if not mp.exists():
        print("No letter model"); ltr_info="No letter model"; return
    try:
        with open(mp,'rb') as f: ltr_model=pickle.load(f)
        sp=W/'scaler.pkl'
        if sp.exists():
            with open(sp,'rb') as f: ltr_scaler=pickle.load(f)
        from sklearn.preprocessing import LabelEncoder
        ltr_le=LabelEncoder()
        lp=W/'label_encoder.pkl'
        if lp.exists():
            with open(lp,'rb') as f: raw=pickle.load(f)
            ltr_le.classes_=raw.classes_ if hasattr(raw,'classes_') else np.array(real_labels)
        else:
            ltr_le.classes_=np.array(real_labels)
        # Fix numeric
        if all(str(c).isdigit() for c in ltr_le.classes_):
            ltr_le.classes_=np.array(real_labels[:len(ltr_le.classes_)])
            with open(W/'label_encoder.pkl','wb') as f: pickle.dump(ltr_le,f)
        ltr_loaded=True
        ltr_info=f"{type(ltr_model).__name__}|{len(ltr_le.classes_)}cls|norm={ltr_use_norm}"
        print(f"Letter model: {ltr_info}")
        print(f"Letter classes: {ltr_le.classes_}")
    except Exception as e:
        import traceback; traceback.print_exc()
        ltr_info=str(e)


def load_word_model():
    global wrd_model,wrd_scaler,wrd_le,wrd_loaded,wrd_classes
    wp=W/'word_classifier.pkl'
    if not wp.exists():
        print("No word model — run train_words.py"); return
    try:
        with open(wp,'rb') as f: wrd_model=pickle.load(f)
        wsp=W/'word_scaler.pkl'
        if wsp.exists():
            with open(wsp,'rb') as f: wrd_scaler=pickle.load(f)
        wlp=W/'word_label_encoder.pkl'
        if wlp.exists():
            with open(wlp,'rb') as f: wrd_le=pickle.load(f)
            wrd_classes=list(wrd_le.classes_)
        wrd_loaded=True
        print(f"Word model: {type(wrd_model).__name__} | classes={wrd_classes}")
        # Verify no single class dominating
        print(f"Word model n_features: {getattr(wrd_model,'n_features_in_','?')}")
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"Word load error: {e}")


def letter_predict(flat):
    try:
        X=(normalize(flat) if ltr_use_norm else np.array(flat,dtype=np.float32)).reshape(1,-1)
        ns=getattr(ltr_scaler,'n_features_in_',None)
        if ns and X.shape[1]!=ns:
            X=(np.array(flat,dtype=np.float32) if ltr_use_norm else normalize(flat)).reshape(1,-1)
        if ltr_scaler: X=ltr_scaler.transform(X)
        proba=ltr_model.predict_proba(X)[0]
        top=np.argsort(proba)[::-1]
        ti=int(top[0]); tc=float(proba[ti])
        def i2l(i):
            ltr=str(ltr_le.classes_[i]) if i<len(ltr_le.classes_) else '?'
            if ltr.isdigit() and int(ltr)<len(real_labels): ltr=real_labels[int(ltr)]
            return ltr
        alts=[{"letter":i2l(i),"confidence":float(proba[i])} for i in top[1:4] if i<len(ltr_le.classes_)]
        return {"letter":i2l(ti) if tc>0.35 else None,"confidence":tc,"alternatives":alts,"source":"letter-ml"}
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"letter":None,"confidence":0.0,"alternatives":[],"source":"error"}


def word_predict(flat):
    try:
        # Word model ALWAYS uses normalization
        X=normalize(flat).reshape(1,-1)
        ns=getattr(wrd_scaler,'n_features_in_',None)
        if ns and X.shape[1]!=ns:
            print(f"Word feature mismatch: got {X.shape[1]} need {ns}")
            return {"word":None,"confidence":0.0,"alternatives":[],"source":"error"}
        if wrd_scaler: X=wrd_scaler.transform(X)

        proba=wrd_model.predict_proba(X)[0]
        top  =np.argsort(proba)[::-1]
        ti   =int(top[0]); tc=float(proba[ti])

        # Log all probabilities for debugging
        print(f"Word proba: {[(str(wrd_le.classes_[i]),round(float(proba[i]),3)) for i in range(len(wrd_le.classes_))]}")

        top_word=str(wrd_le.classes_[ti]) if ti<len(wrd_le.classes_) else None
        alts=[{"word":str(wrd_le.classes_[i]),"confidence":float(proba[i])}
              for i in top[1:3] if i<len(wrd_le.classes_)]

        # Higher threshold for words to avoid false positives
        MIN_WORD_CONF = 0.55
        return {
            "word":        top_word if tc>=MIN_WORD_CONF else None,
            "confidence":  tc,
            "alternatives":alts,
            "source":      "word-ml"
        }
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"word":None,"confidence":0.0,"alternatives":[],"source":"error"}


def init_db():
    c=sqlite3.connect(DB_PATH)
    c.execute("CREATE TABLE IF NOT EXISTS translations(id INTEGER PRIMARY KEY AUTOINCREMENT,text TEXT NOT NULL,created TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,email TEXT,subject TEXT,message TEXT NOT NULL,created TEXT NOT NULL)")
    c.commit(); c.close()


@asynccontextmanager
async def lifespan(app):
    init_db(); load_letter_model(); load_word_model(); yield

app=FastAPI(title="SignBridge",version="9.0.0",lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_credentials=True,allow_methods=["*"],allow_headers=["*"])

class PredictReq(BaseModel):
    landmarks: list[float]
    mode: Optional[str]="letter"

class SaveReq(BaseModel): text:str
class FeedbackReq(BaseModel):
    name:Optional[str]=""; email:Optional[str]=""
    subject:Optional[str]=""; message:str


@app.get("/")
def root():
    return {"app":"SignBridge","version":"9.0.0",
            "letter_model":ltr_loaded,"word_model":wrd_loaded,
            "word_classes":wrd_classes}

@app.get("/api/health")
def health():
    return {
        "status":       "healthy",
        "model_loaded": bool(ltr_loaded),
        "word_loaded":  bool(wrd_loaded),
        "model_info":   str(ltr_info),
        "classes":      list(ltr_le.classes_) if ltr_le else [],
        "word_classes": wrd_classes,
        "timestamp":    datetime.utcnow().isoformat(),
    }

@app.post("/api/predict")
def predict(req:PredictReq):
    if len(req.landmarks)!=63:
        raise HTTPException(400,f"Need 63, got {len(req.landmarks)}")
    if not ltr_loaded:
        raise HTTPException(503,"Letter model not loaded")

    t0=time.perf_counter()
    mode=req.mode or "letter"

    if mode=="word":
        if not wrd_loaded:
            return {"letter":None,"word":None,"confidence":0,
                    "source":"no-word-model","inference_ms":0,"model_loaded":True}
        res=word_predict(req.landmarks)
        return {"letter":None,"word":res["word"],"confidence":res["confidence"],
                "alternatives":res["alternatives"],"source":res["source"],
                "inference_ms":round((time.perf_counter()-t0)*1000,2),
                "model_loaded":True,"word_loaded":wrd_loaded}

    elif mode=="both":
        lres=letter_predict(req.landmarks)
        wres=word_predict(req.landmarks) if wrd_loaded else {"word":None,"confidence":0}
        ms=round((time.perf_counter()-t0)*1000,2)
        return {"letter":lres.get("letter"),"word":wres.get("word"),
                "letter_conf":lres["confidence"],"word_conf":wres["confidence"],
                "alternatives":lres.get("alternatives",[]),
                "source":lres["source"],"inference_ms":ms,
                "model_loaded":True,"word_loaded":wrd_loaded}

    else:  # letter
        res=letter_predict(req.landmarks)
        return {**res,"word":None,
                "inference_ms":round((time.perf_counter()-t0)*1000,2),
                "model_loaded":True,"word_loaded":wrd_loaded}

@app.post("/api/translations")
def save_t(req:SaveReq):
    if not req.text.strip(): raise HTTPException(400,"Empty")
    c=sqlite3.connect(DB_PATH)
    cur=c.execute("INSERT INTO translations(text,created)VALUES(?,?)",
                  (req.text.strip(),datetime.utcnow().isoformat()))
    c.commit(); rid=cur.lastrowid; c.close()
    return {"id":rid,"saved":True}

@app.get("/api/translations")
def get_t(limit:int=20):
    c=sqlite3.connect(DB_PATH)
    rows=c.execute("SELECT id,text,created FROM translations ORDER BY id DESC LIMIT ?",(limit,)).fetchall()
    c.close()
    return [{"id":r[0],"text":r[1],"created":r[2]} for r in rows]

@app.delete("/api/translations")
def del_t():
    c=sqlite3.connect(DB_PATH); c.execute("DELETE FROM translations")
    c.commit(); c.close(); return {"cleared":True}

@app.post("/api/feedback")
def fb(req:FeedbackReq):
    if not req.message.strip(): raise HTTPException(400,"Empty")
    c=sqlite3.connect(DB_PATH)
    c.execute("INSERT INTO feedback(name,email,subject,message,created)VALUES(?,?,?,?,?)",
              (req.name,req.email,req.subject,req.message,datetime.utcnow().isoformat()))
    c.commit(); c.close(); return {"submitted":True}

@app.websocket("/ws/predict")
async def ws(websocket:WebSocket):
    await websocket.accept()
    try:
        while True:
            data=json.loads(await websocket.receive_text())
            flat=data.get("landmarks",[]); mode=data.get("mode","letter")
            if len(flat)!=63:
                await websocket.send_json({"error":"Need 63"}); continue
            if not ltr_loaded:
                await websocket.send_json({"error":"No model"}); continue
            t0=time.perf_counter()
            if mode=="word" and wrd_loaded:
                res=word_predict(flat)
            else:
                res=letter_predict(flat)
            await websocket.send_json({**res,"inference_ms":round((time.perf_counter()-t0)*1000,2)})
    except WebSocketDisconnect: pass
    except Exception as e: print(f"WS:{e}")

if __name__=="__main__":
    uvicorn.run("main:app",host="0.0.0.0",port=8000,reload=True)
