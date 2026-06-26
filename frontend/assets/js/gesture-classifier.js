/**
 * gesture-classifier.js — SignBridge v6
 * Completely rewritten — strict non-overlapping rules.
 * Based on Gerard Aflague ASL alphabet chart.
 *
 * KEY FIX: V was matching everything because conditions were too loose.
 * Now every letter has BOTH positive AND negative guard conditions.
 *
 * MediaPipe landmarks:
 *   0=WRIST
 *   1-4=THUMB  (cmc,mcp,ip,tip)
 *   5-8=INDEX  (mcp,pip,dip,tip)
 *   9-12=MIDDLE(mcp,pip,dip,tip)
 *   13-16=RING (mcp,pip,dip,tip)
 *   17-20=PINKY(mcp,pip,dip,tip)
 */
class GestureClassifier {
  constructor() {
    this.wordGestures = this._buildWordGestures();
  }

  /* ── NORMALIZE ─────────────────────────────────── */
  normalize(landmarks) {
    const w = landmarks[0];
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    for (const p of landmarks) {
      if(p.x<x0)x0=p.x; if(p.x>x1)x1=p.x;
      if(p.y<y0)y0=p.y; if(p.y>y1)y1=p.y;
    }
    const sc = Math.max(x1-x0, y1-y0) || 1;
    return landmarks.map(p=>({x:(p.x-w.x)/sc, y:(p.y-w.y)/sc, z:(p.z-w.z)/sc}));
  }

  /* ── PRIMITIVES ────────────────────────────────── */
  // tip clearly above pip → finger pointing UP
  up(lm,tip,pip)  { return lm[tip].y < lm[pip].y - 0.07; }
  // tip at or below mcp → finger curled DOWN
  dn(lm,tip,mcp)  { return lm[tip].y >= lm[mcp].y - 0.05; }
  // Euclidean distance
  d(lm,a,b) {
    return Math.sqrt((lm[a].x-lm[b].x)**2+(lm[a].y-lm[b].y)**2+(lm[a].z-lm[b].z)**2);
  }

  /* ── FINGER STATES ─────────────────────────────── */
  iUp(lm)  { return this.up(lm,8,6);  }   // index up
  mUp(lm)  { return this.up(lm,12,10);}   // middle up
  rUp(lm)  { return this.up(lm,16,14);}   // ring up
  pUp(lm)  { return this.up(lm,20,18);}   // pinky up
  iDn(lm)  { return this.dn(lm,8,5);  }   // index down
  mDn(lm)  { return this.dn(lm,12,9); }   // middle down
  rDn(lm)  { return this.dn(lm,16,13);}   // ring down
  pDn(lm)  { return this.dn(lm,20,17);}   // pinky down

  allUp(lm){ return this.iUp(lm)&&this.mUp(lm)&&this.rUp(lm)&&this.pUp(lm); }
  allDn(lm){ return this.iDn(lm)&&this.mDn(lm)&&this.rDn(lm)&&this.pDn(lm); }

  /* ── THUMB STATES ──────────────────────────────── */
  // thumb tip far LEFT of thumb mcp → thumb sticking out sideways
  tOut(lm)  { return lm[4].x < lm[2].x - 0.07; }
  // thumb tip in front of index mcp AND not above pip → thumb wraps over fist (S)
  tOver(lm) { return lm[4].x > lm[5].x - 0.05 && lm[4].y < lm[6].y + 0.03; }
  // thumb tip BELOW index mcp → thumb tucked under fingers (E)
  tUnder(lm){ return lm[4].y > lm[5].y + 0.03; }

  /* ── USEFUL MEASURES ───────────────────────────── */
  imSp(lm)   { return this.d(lm,8,12);  }  // index-middle tip spread
  fullSp(lm) { return this.d(lm,8,20);  }  // index-pinky tip spread
  pinch(lm)  { return this.d(lm,4,8) < 0.13; } // thumb-index pinch
  palmFwd(lm){ return lm[4].x < lm[8].x; } // palm facing camera

  // Index pointing SIDEWAYS not up
  iSide(lm) {
    return Math.abs(lm[8].y - lm[5].y) < 0.11 && lm[8].x < lm[5].x - 0.06;
  }
  // Index+middle pointing SIDEWAYS (H)
  imSide(lm) {
    return Math.abs(lm[8].y-lm[5].y)<0.13 && Math.abs(lm[12].y-lm[9].y)<0.13
           && Math.abs(lm[8].y-lm[12].y)<0.08;
  }
  // Index pointing DOWN (below its own MCP)
  iDown2(lm) { return lm[8].y > lm[5].y + 0.09; }
  // Middle pointing DOWN
  mDown2(lm) { return lm[12].y > lm[9].y + 0.06; }

  /* ── CLASSIFY LETTER ───────────────────────────── */
  classifyLetter(raw) {
    if (!raw||raw.length<21) return {letter:null,confidence:0};
    const lm = this.normalize(raw);

    // cache states
    const IU=this.iUp(lm), MU=this.mUp(lm), RU=this.rUp(lm), PU=this.pUp(lm);
    const ID=this.iDn(lm), MD=this.mDn(lm), RD=this.rDn(lm), PD=this.pDn(lm);
    const AU=this.allUp(lm), AD=this.allDn(lm);
    const TO=this.tOut(lm), TV=this.tOver(lm), TU=this.tUnder(lm);
    const PK=this.pinch(lm);
    const IS=this.imSp(lm), FS=this.fullSp(lm);

    // ════════════════════════════════════════════════
    // FIST FAMILY  (all fingers down)
    // Order matters: check most-specific FIRST
    // ════════════════════════════════════════════════

    if (AD) {
      // S — thumb wraps OVER the front of all knuckles
      if (TV && !TO && !TU)
        return {letter:'S', confidence:0.90};

      // A — thumb on SIDE, NOT over, NOT under
      if (TO && !TV && !TU)
        return {letter:'A', confidence:0.91};

      // E — thumb tucked UNDER fingers
      if (TU && !TO && !TV)
        return {letter:'E', confidence:0.83};

      // M — 3 fingers over thumb: index+mid+ring tips all BELOW thumb tip
      if (!TO && !TV && !TU) {
        const t4 = lm[4].y;
        if (t4 > lm[8].y && t4 > lm[12].y && t4 > lm[16].y)
          return {letter:'M', confidence:0.81};
        // N — only index+mid below thumb, ring tip ABOVE thumb
        if (t4 > lm[8].y && t4 > lm[12].y && t4 < lm[16].y)
          return {letter:'N', confidence:0.79};
        // T — thumb pokes between index and middle horizontally
        if (lm[4].x > lm[5].x-0.10 && lm[4].x < lm[9].x+0.10 && lm[4].y < lm[6].y)
          return {letter:'T', confidence:0.80};
      }
    }

    // ════════════════════════════════════════════════
    // SINGLE FINGER FAMILY
    // ════════════════════════════════════════════════

    // Y — thumb OUT + ONLY pinky up
    if (PU && TO && !IU && !MU && !RU)
      return {letter:'Y', confidence:0.93};

    // I — ONLY pinky up, no thumb out
    if (PU && !IU && !MU && !RU && !TO)
      return {letter:'I', confidence:0.92};

    // L — index up + thumb out, others down, large gap between them
    if (IU && TO && !MU && !RU && !PU && this.d(lm,4,8)>0.26)
      return {letter:'L', confidence:0.94};

    // D — index up, others curl to touch thumb tip
    if (IU && MD && RD && PD && !TO && this.d(lm,4,12)<0.21)
      return {letter:'D', confidence:0.87};

    // X — index hooked (partially bent, not up, not fully down)
    if (!IU && !this.iDn(lm) && !MU && !RU && !PU && !TO) {
      if (lm[8].y > lm[7].y && lm[7].y < lm[5].y)
        return {letter:'X', confidence:0.77};
    }

    // G — index pointing SIDEWAYS, others down
    if (this.iSide(lm) && !MU && !RU && !PU && !TO)
      return {letter:'G', confidence:0.83};

    // Q — index and thumb both pointing DOWN
    if (IU && !MU && !RU && !PU && !TO && this.iDown2(lm) && lm[4].y > lm[2].y)
      return {letter:'Q', confidence:0.76};

    // ════════════════════════════════════════════════
    // TWO FINGER FAMILY  (index + middle up)
    // Most specific conditions checked first
    // V is LAST so it doesn't steal matches
    // ════════════════════════════════════════════════

    if (IU && MU && !RU && !PU) {

      // H — both fingers SIDEWAYS (horizontal)
      if (this.imSide(lm))
        return {letter:'H', confidence:0.84};

      // P — both fingers pointing DOWNWARD
      if (this.iDown2(lm) && this.mDown2(lm))
        return {letter:'P', confidence:0.78};

      // K — both fingers up, thumb between them pointing up
      if (TO && lm[4].y < lm[6].y && IS > 0.09 && IS < 0.22)
        return {letter:'K', confidence:0.84};

      // R — fingers crossed: extremely close together
      if (IS < 0.05 && lm[8].y < lm[5].y)
        return {letter:'R', confidence:0.85};

      // U — fingers close together, pointing up (not crossed)
      if (IS >= 0.05 && IS <= 0.13 && lm[8].y < lm[5].y && !TO)
        return {letter:'U', confidence:0.88};

      // V — fingers SPREAD apart, pointing up — checked LAST
      if (IS > 0.13 && lm[8].y < lm[5].y && !TO)
        return {letter:'V', confidence:0.90};
    }

    // ════════════════════════════════════════════════
    // THREE FINGERS FAMILY
    // ════════════════════════════════════════════════

    // W — index + middle + ring up, spread, pinky down
    if (IU && MU && RU && !PU && this.d(lm,8,16) > 0.15)
      return {letter:'W', confidence:0.89};

    // ════════════════════════════════════════════════
    // ALL FINGERS UP FAMILY
    // ════════════════════════════════════════════════

    // B — all 4 fingers up, close together, thumb folded in
    if (AU && !TO && FS < 0.26)
      return {letter:'B', confidence:0.91};

    // ════════════════════════════════════════════════
    // SPECIAL SHAPES
    // ════════════════════════════════════════════════

    // F — thumb+index pinch, other 3 fingers extended up
    if (PK && MU && RU && PU)
      return {letter:'F', confidence:0.88};

    // O — all fingers curve to thumb, round O circle
    if (PK && !AU && !AD && this.d(lm,4,12)<0.25 && this.d(lm,4,16)<0.30)
      return {letter:'O', confidence:0.85};

    // C — curved C, all fingers partly bent, gap between thumb and fingers
    if (!AU && !AD && !PK && lm[8].y < lm[5].y && lm[8].y > lm[6].y
        && this.d(lm,4,8) > 0.22)
      return {letter:'C', confidence:0.79};

    return {letter:null, confidence:0};
  }

  /* ── WORD GESTURES ─────────────────────────────── */
  _buildWordGestures() {
    const s = this;
    return [
      { word:'Hello',     emoji:'👋', category:'greeting',
        description:'Open palm forward, all fingers spread wide',
        detect(lm){ if(s.allUp(lm)&&s.palmFwd(lm)&&s.fullSp(lm)>0.28&&s.tOut(lm))return 0.93;
                    if(s.allUp(lm)&&s.palmFwd(lm)&&s.fullSp(lm)>0.20)return 0.80; return false; }},
      { word:'Bye',       emoji:'🖐️', category:'greeting',
        description:'Open hand, fingers close together, wave',
        detect(lm){ const sp=s.fullSp(lm);
                    if(s.allUp(lm)&&s.palmFwd(lm)&&sp<0.20&&sp>0.08)return 0.88; return false; }},
      { word:'Yes',       emoji:'✊', category:'response',
        description:'Closed fist, nod up and down',
        detect(lm){ if(s.allDn(lm)&&!s.tOut(lm)&&s.palmFwd(lm))return 0.87; return false; }},
      { word:'No',        emoji:'🚫', category:'response',
        description:'Index and middle together, tap side to side',
        detect(lm){ if(s.iUp(lm)&&s.mUp(lm)&&s.rDn(lm)&&s.pDn(lm)&&s.imSp(lm)<0.08)return 0.85; return false; }},
      { word:'Thank You', emoji:'🙏', category:'courtesy',
        description:'Flat hand from chin moving forward',
        detect(lm){ if(s.allUp(lm)&&s.fullSp(lm)<0.15&&!s.tOut(lm))return 0.82; return false; }},
      { word:'Please',    emoji:'🤲', category:'courtesy',
        description:'Flat hand circular motion on chest',
        detect(lm){ if(s.allUp(lm)&&s.fullSp(lm)<0.18&&!s.palmFwd(lm))return 0.80; return false; }},
      { word:'Sorry',     emoji:'😔', category:'courtesy',
        description:'Fist on chest, circular motion',
        detect(lm){ if(s.allDn(lm)&&!s.palmFwd(lm)&&lm[4].y<lm[6].y)return 0.83; return false; }},
      { word:'Help',      emoji:'👍', category:'common',
        description:'Thumbs up — thumb pointing up high',
        detect(lm){ if(s.tOut(lm)&&s.allDn(lm)&&lm[4].y<lm[2].y-0.10)return 0.91; return false; }},
      { word:'Good',      emoji:'👌', category:'common',
        description:'OK sign — thumb+index circle, others extended',
        detect(lm){ if(s.pinch(lm)&&s.mUp(lm)&&s.rUp(lm)&&s.pUp(lm))return 0.88; return false; }},
      { word:'Bad',       emoji:'👎', category:'common',
        description:'Thumbs down',
        detect(lm){ if(s.allDn(lm)&&lm[4].y>lm[2].y+0.08)return 0.87; return false; }},
      { word:'I Love You',emoji:'🤟', category:'emotion',
        description:'ILY — thumb + index + pinky extended',
        detect(lm){ if(s.tOut(lm)&&s.iUp(lm)&&s.mDn(lm)&&s.rDn(lm)&&s.pUp(lm))return 0.95; return false; }},
      { word:'Peace',     emoji:'✌️', category:'emotion',
        description:'V sign — index and middle spread, palm forward',
        detect(lm){ if(s.iUp(lm)&&s.mUp(lm)&&s.rDn(lm)&&s.pDn(lm)&&s.imSp(lm)>0.14&&s.palmFwd(lm))return 0.90; return false; }},
      { word:'Stop',      emoji:'✋', category:'common',
        description:'Open palm facing outward — halt',
        detect(lm){ if(s.allUp(lm)&&s.palmFwd(lm)&&s.fullSp(lm)>0.15&&!s.tOut(lm))return 0.84; return false; }},
      { word:'Call Me',   emoji:'🤙', category:'common',
        description:'Thumb and pinky out — phone / shaka sign',
        detect(lm){ if(s.tOut(lm)&&s.iDn(lm)&&s.mDn(lm)&&s.rDn(lm)&&s.pUp(lm))return 0.92; return false; }},
      { word:'More',      emoji:'🤌', category:'common',
        description:'All fingertips pinched together, tap',
        detect(lm){ if(s.d(lm,4,8)<0.15&&s.d(lm,4,12)<0.18&&s.d(lm,4,16)<0.20&&s.d(lm,4,20)<0.22)return 0.85; return false; }},
      { word:'Water',     emoji:'💧', category:'common',
        description:'W shape — index, middle, ring fingers up',
        detect(lm){ if(s.iUp(lm)&&s.mUp(lm)&&s.rUp(lm)&&s.pDn(lm)&&s.d(lm,8,16)>0.18)return 0.83; return false; }},
      { word:'Where?',    emoji:'🤷', category:'question',
        description:'Index pointing up, wrist tilted to side',
        detect(lm){ if(s.iUp(lm)&&s.mDn(lm)&&s.rDn(lm)&&s.pDn(lm)&&!s.tOut(lm)&&Math.abs(lm[17].x-lm[5].x)>0.15)return 0.78; return false; }},
      { word:'Me',        emoji:'👆', category:'pronoun',
        description:'Index finger pointing toward yourself',
        detect(lm){ if(s.iUp(lm)&&s.mDn(lm)&&s.rDn(lm)&&s.pDn(lm)&&!s.tOut(lm)&&lm[8].y>lm[5].y)return 0.83; return false; }},
      { word:'You',       emoji:'☝️', category:'pronoun',
        description:'Index finger pointing outward at someone',
        detect(lm){ if(s.iUp(lm)&&s.mDn(lm)&&s.rDn(lm)&&s.pDn(lm)&&!s.tOut(lm)&&lm[8].y<lm[5].y-0.10)return 0.82; return false; }},
    ];
  }

  /* ── WORD CLASSIFY ─────────────────────────────── */
  classifyWord(raw) {
    if (!raw||raw.length<21) return null;
    const lm = this.normalize(raw);
    let best=null, bestC=0;
    for (const g of this.wordGestures) {
      const r = g.detect(lm);
      if (r && r > bestC) { bestC=r; best=g; }
    }
    if (best && bestC > 0.75)
      return {word:best.word, emoji:best.emoji, category:best.category,
              description:best.description, confidence:bestC};
    return null;
  }

  /* ── UNIFIED CLASSIFY ──────────────────────────── */
  classify(raw, mode='letter') {
    if (mode==='word') {
      const w=this.classifyWord(raw);
      if(w) return {type:'word',label:w.word,emoji:w.emoji,category:w.category,confidence:w.confidence};
      return {type:null,label:null,confidence:0};
    }
    if (mode==='letter') {
      const {letter,confidence}=this.classifyLetter(raw);
      if(letter) return {type:'letter',label:letter,emoji:null,confidence};
      return {type:null,label:null,confidence:0};
    }
    // both — word wins only if very confident
    const w=this.classifyWord(raw);
    if(w&&w.confidence>0.85)
      return {type:'word',label:w.word,emoji:w.emoji,category:w.category,confidence:w.confidence};
    const {letter,confidence}=this.classifyLetter(raw);
    if(letter) return {type:'letter',label:letter,emoji:null,confidence};
    return {type:null,label:null,confidence:0};
  }

  getWordGestureList() {
    return this.wordGestures.map(g=>({word:g.word,emoji:g.emoji,category:g.category,description:g.description}));
  }
}

window.GestureClassifier = GestureClassifier;
