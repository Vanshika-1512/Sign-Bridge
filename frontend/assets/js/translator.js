/**
 * translator.js - SignBridge
 * Letters use letter ML model.
 * Words use word ML model (separate endpoint).
 * Rule-based completely disabled.
 */
(function () {

  const API_BASE    = 'http://localhost:8000';
  const MIN_CONF    = 0.40;
  const HOLD_FRAMES = 20;

  // ── DOM ───────────────────────────────────────────
  const video          = document.getElementById('webcamFeed');
  const canvas         = document.getElementById('overlayCanvas');
  const ctx            = canvas.getContext('2d');
  const placeholder    = document.getElementById('videoPlaceholder');
  const btnStart       = document.getElementById('btnStartCamera');
  const btnStop        = document.getElementById('btnStopCamera');
  const statusBadge    = document.getElementById('statusBadge');
  const statusText     = document.getElementById('statusText');
  const fpsCounter     = document.getElementById('fpsCounter');
  const bigLetter      = document.getElementById('bigLetter');
  const wordBadge      = document.getElementById('wordBadge');
  const statGesture    = document.getElementById('statGesture');
  const statFrames     = document.getElementById('statFrames');
  const confValue      = document.getElementById('confValue');
  const confBar        = document.getElementById('confBar');
  const translatedText = document.getElementById('translatedText');
  const btnAddLetter   = document.getElementById('btnAddLetter');
  const btnAddSpace    = document.getElementById('btnAddSpace');
  const btnBackspace   = document.getElementById('btnBackspace');
  const btnClear       = document.getElementById('btnClear');
  const btnSpeak       = document.getElementById('btnSpeak');
  const btnCopyText    = document.getElementById('btnCopyText');
  const btnSaveHistory = document.getElementById('btnSaveHistory');
  const btnClearHistory= document.getElementById('btnClearHistory');
  const historyLog     = document.getElementById('historyLog');
  const togAutoAppend  = document.getElementById('togAutoAppend');
  const togTTS         = document.getElementById('togTTS');
  const togLandmarks   = document.getElementById('togLandmarks');
  const confThreshold  = document.getElementById('confThreshold');
  const threshVal      = document.getElementById('threshVal');
  const aslGrid        = document.getElementById('aslGrid');
  const wordGrid       = document.getElementById('wordGrid');
  const modeLabel      = document.getElementById('modeLabel');
  const btnModeLetters = document.getElementById('btnModeLetters');
  const btnModeWords   = document.getElementById('btnModeWords');
  const btnModeBoth    = document.getElementById('btnModeBoth');

  // ── State ─────────────────────────────────────────
  let stream        = null;
  let hands         = null;
  let cameraObj     = null;
  let outputText    = '';
  let currentLabel  = null;
  let currentType   = null; // 'letter' or 'word'
  let holdLabel     = null;
  let holdCount     = 0;
  let accepted      = false;
  let frameCount    = 0;
  let fpsFrames     = 0;
  let lastFpsTime   = Date.now();
  let history       = JSON.parse(localStorage.getItem('sb_history') || '[]');
  let showLandmarks = true;
  let threshold     = 0.40;
  let detectionMode = 'letter'; // 'letter' | 'word' | 'both'
  let backendOnline = false;
  let wordModelOnline = false;
  let pendingReq    = false;

  const aslEmoji = {
    A:'🤜',B:'🖐',C:'🤙',D:'☝️',E:'✊',F:'🤏',G:'👉',H:'🤞',
    I:'🤙',K:'✌️',L:'👆',M:'✊',N:'✌️',O:'👌',P:'👇',
    Q:'👇',R:'🤞',S:'✊',T:'✊',U:'✌️',V:'✌️',W:'🖖',X:'☝️',Y:'🤙'
  };

  // ── CHECK BACKEND ─────────────────────────────────
  async function checkBackend() {
    try {
      const r = await fetch(`${API_BASE}/api/health`,
                            {signal: AbortSignal.timeout(2000)});
      if (r.ok) {
        const d = await r.json();
        backendOnline   = true;
        wordModelOnline = d.word_loaded || false;
        const wordStatus = wordModelOnline
          ? `✅ Letter + Word ML ready`
          : `✅ Letter ML ready (no word model yet)`;
        setStatus('active', wordStatus);
        return true;
      }
    } catch {
      backendOnline   = false;
      wordModelOnline = false;
      setStatus('error', '❌ Backend offline — run: python backend/main.py');
    }
    return false;
  }

  // ── CALL BACKEND ──────────────────────────────────
  async function callBackend(landmarks, mode) {
    if (!backendOnline || pendingReq) return null;
    pendingReq = true;
    try {
      const flat = landmarks.map(lm => [lm.x, lm.y, lm.z]).flat();
      const r    = await fetch(`${API_BASE}/api/predict`, {
        method:  'POST',
        headers: {'Content-Type': 'application/json'},
        body:    JSON.stringify({landmarks: flat, mode: mode}),
        signal:  AbortSignal.timeout(500),
      });
      if (r.ok) return await r.json();
    } catch {
      backendOnline = false;
      setStatus('error', '❌ Backend lost — run: python backend/main.py');
    } finally {
      pendingReq = false;
    }
    return null;
  }

  // ── BUILD REFERENCE GRIDS ─────────────────────────
  function buildGrids() {
    // Letter grid
    if (aslGrid) {
      aslGrid.innerHTML = '';
      'ABCDEFGHIKLMNOPQRSTUVWXY'.split('').forEach(l => {
        const el = document.createElement('div');
        el.className = 'asl-letter';
        el.id = `asl-${l}`;
        el.innerHTML = `<span>${aslEmoji[l]||'✋'}</span><span>${l}</span>`;
        aslGrid.appendChild(el);
      });
    }

    // Word grid — clickable cards to manually insert words
    if (wordGrid) {
      wordGrid.innerHTML = '';
      const WORD_LIST = [
        {word:'Hello',     emoji:'👋', category:'greeting',  desc:'Open palm forward'},
        {word:'Bye',       emoji:'🖐️', category:'greeting',  desc:'Open hand wave'},
        {word:'Yes',       emoji:'✊', category:'response',  desc:'Closed fist'},
        {word:'No',        emoji:'🚫', category:'response',  desc:'Index+middle together'},
        {word:'ThankYou',  emoji:'🙏', category:'courtesy',  desc:'Flat hand from chin'},
        {word:'Please',    emoji:'🤲', category:'courtesy',  desc:'Flat hand on chest'},
        {word:'Sorry',     emoji:'😔', category:'courtesy',  desc:'Fist on chest'},
        {word:'Help',      emoji:'👍', category:'common',    desc:'Thumbs up'},
        {word:'Good',      emoji:'👌', category:'common',    desc:'OK sign'},
        {word:'Bad',       emoji:'👎', category:'common',    desc:'Thumbs down'},
        {word:'ILoveYou',  emoji:'🤟', category:'emotion',   desc:'ILY sign'},
        {word:'Peace',     emoji:'✌️', category:'emotion',   desc:'V sign'},
        {word:'Stop',      emoji:'✋', category:'common',    desc:'Palm outward'},
        {word:'CallMe',    emoji:'🤙', category:'common',    desc:'Shaka sign'},
        {word:'More',      emoji:'🤌', category:'common',    desc:'Fingertips pinched'},
      ];
      const cats = {};
      WORD_LIST.forEach(g => {
        if (!cats[g.category]) cats[g.category] = [];
        cats[g.category].push(g);
      });
      Object.entries(cats).forEach(([cat, items]) => {
        const hdr = document.createElement('div');
        hdr.className = 'word-grid__header';
        hdr.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        wordGrid.appendChild(hdr);
        items.forEach(g => {
          const el = document.createElement('div');
          el.className = 'word-card';
          el.id = `word-${g.word}`;
          el.innerHTML = `<span class="word-card__emoji">${g.emoji}</span>
                          <span class="word-card__label">${g.word}</span>
                          <span class="word-card__desc">${g.desc}</span>`;
          el.addEventListener('click', () => {
            outputText += g.word + ' '; renderText();
          });
          wordGrid.appendChild(el);
        });
      });
    }
  }

  // ── MODE ──────────────────────────────────────────
  function setMode(mode) {
    detectionMode = mode;
    [btnModeLetters,btnModeWords,btnModeBoth].forEach(b => b && b.classList.remove('active'));
    const map = {letter:btnModeLetters, word:btnModeWords, both:btnModeBoth};
    if (map[mode]) map[mode].classList.add('active');
    if (modeLabel) modeLabel.textContent = {
      letter: 'Letter Mode (ML)',
      word:   'Word Mode (ML)',
      both:   'Letter + Word (ML)',
    }[mode] || '';

    // Show/hide reference panels
    const lPanel = document.getElementById('letterRefPanel');
    const wPanel = document.getElementById('wordRefPanel');
    if (lPanel) lPanel.style.display = mode === 'word'   ? 'none' : '';
    if (wPanel) wPanel.style.display = mode === 'letter' ? 'none' : '';

    resetDetection();
    accepted = false; holdLabel = null; holdCount = 0;
  }

  if (btnModeLetters) btnModeLetters.addEventListener('click', () => setMode('letter'));
  if (btnModeWords)   btnModeWords.addEventListener('click',   () => setMode('word'));
  if (btnModeBoth)    btnModeBoth.addEventListener('click',    () => setMode('both'));

  // ── MEDIAPIPE ─────────────────────────────────────
  function initMediaPipe() {
    hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
    });
    hands.setOptions({
      maxNumHands:1, modelComplexity:1,
      minDetectionConfidence:0.65, minTrackingConfidence:0.55,
    });
    hands.onResults(onHandResults);
  }

  // ── CAMERA ────────────────────────────────────────
  async function startCamera() {
    const ok = await checkBackend();
    if (!ok) {
      alert('Backend offline!\n\nRun in terminal:\n  python backend/main.py\n\nThen try again.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia(
        {video:{width:640,height:480,facingMode:'user'}, audio:false}
      );
      video.srcObject = stream;
      await video.play();
      placeholder.style.display = 'none';
      btnStart.style.display    = 'none';
      btnStop.style.display     = '';
      if (btnAddLetter) btnAddLetter.disabled = false;
      if (btnSpeak)     btnSpeak.disabled = false;
      video.addEventListener('loadedmetadata', () => {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      });
      if (!hands) initMediaPipe();
      if (typeof Camera !== 'undefined') {
        cameraObj = new Camera(video, {
          onFrame: async () => {
            fpsFrames++; frameCount++; updateFps();
            await hands.send({image: video});
          }, width:640, height:480,
        });
        cameraObj.start();
      } else { processFrames(); }
    } catch (e) {
      setStatus('error','Camera denied');
      alert('Camera access denied.');
    }
  }

  function stopCamera() {
    if (stream)    { stream.getTracks().forEach(t=>t.stop()); stream=null; }
    if (cameraObj) { cameraObj.stop(); cameraObj=null; }
    video.srcObject = null;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    placeholder.style.display = '';
    btnStart.style.display    = '';
    btnStop.style.display     = 'none';
    setStatus('idle','Camera off');
    resetDetection();
  }

  async function processFrames() {
    if (!stream) return;
    fpsFrames++; frameCount++; updateFps();
    if (hands && video.readyState === 4) await hands.send({image: video});
    requestAnimationFrame(processFrames);
  }

  // ── HAND RESULTS ──────────────────────────────────
  async function onHandResults(results) {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
      holdLabel=null; holdCount=0; resetDetection(); return;
    }

    const lms = results.multiHandLandmarks[0];
    if (showLandmarks) drawSkeleton(lms);

    if (!backendOnline) {
      updateUI(null, 0, 'letter', '❌ Backend offline'); return;
    }

    // ── Call correct backend mode ─────────────────
    // Word mode: sends mode=word → backend uses word model
    // Letter mode: sends mode=letter → backend uses letter model
    // Both: sends mode=both → backend runs both and returns both
    const data = await callBackend(lms, detectionMode);
    if (!data) { holdLabel=null; holdCount=0; resetDetection(); return; }

    let label = null, type = 'letter', conf = 0;

    if (detectionMode === 'word') {
      label = data.word;
      type  = 'word';
      conf  = data.confidence || 0;
    } else if (detectionMode === 'both') {
      // Pick whichever is more confident
      const lConf = data.letter_conf || 0;
      const wConf = data.word_conf   || 0;
      if (data.word && wConf > lConf && wConf >= threshold) {
        label = data.word;  type = 'word';   conf = wConf;
      } else if (data.letter && lConf >= threshold) {
        label = data.letter; type = 'letter'; conf = lConf;
      }
    } else {
      // letter mode
      label = data.letter;
      type  = 'letter';
      conf  = data.confidence || 0;
    }

    if (!label || conf < threshold) {
      holdLabel=null; holdCount=0; resetDetection(); return;
    }

    updateUI(label, conf, type, data.source || '');

    // Hold detection
    if (label === holdLabel) { holdCount++; }
    else { holdLabel=label; holdCount=1; }

    if (holdCount >= HOLD_FRAMES && !accepted) {
      accepted  = true;
      holdCount = 0;
      if (togAutoAppend && togAutoAppend.checked) {
        appendToOutput(label, type);
        setTimeout(() => { accepted = false; }, type==='word' ? 2000 : 1500);
      }
    }
  }

  // ── SKELETON ──────────────────────────────────────
  const CONN=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
  function drawSkeleton(lms) {
    const W=canvas.width, H=canvas.height;
    ctx.strokeStyle='rgba(129,140,248,.85)'; ctx.lineWidth=2;
    CONN.forEach(([a,b])=>{
      ctx.beginPath(); ctx.moveTo(lms[a].x*W,lms[a].y*H);
      ctx.lineTo(lms[b].x*W,lms[b].y*H); ctx.stroke();
    });
    lms.forEach((lm,i)=>{
      const tip=[4,8,12,16,20].includes(i);
      ctx.beginPath(); ctx.arc(lm.x*W,lm.y*H,tip?7:4,0,2*Math.PI);
      ctx.fillStyle=tip?'#818cf8':'#c7d2fe'; ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
    });
  }

  // ── UI UPDATE ─────────────────────────────────────
  function updateUI(label, conf, type, source) {
    const pct = Math.round((conf||0)*100);

    if (!label) {
      bigLetter.textContent = '—';
      bigLetter.style.fontSize = '7rem';
      if (wordBadge) wordBadge.style.display = 'none';
      if (statGesture) statGesture.textContent = '—';
      if (confValue)   confValue.textContent   = '0%';
      if (confBar)     confBar.style.width      = '0%';
      document.querySelectorAll('.asl-letter.active-letter')
              .forEach(e=>e.classList.remove('active-letter'));
      document.querySelectorAll('.word-card.active-word')
              .forEach(e=>e.classList.remove('active-word'));
      return;
    }

    // Animate on change
    if (label !== currentLabel) {
      bigLetter.classList.remove('new');
      void bigLetter.offsetWidth;
      bigLetter.classList.add('new');
    }
    currentLabel = label;
    currentType  = type;

    if (type === 'word') {
      // Show emoji for word
      bigLetter.textContent    = getWordEmoji(label);
      bigLetter.style.fontSize = '5rem';
      if (wordBadge) { wordBadge.textContent = label; wordBadge.style.display = 'inline-block'; }
      document.querySelectorAll('.word-card').forEach(el => {
        el.classList.toggle('active-word', el.id === `word-${label}`);
      });
      document.querySelectorAll('.asl-letter.active-letter')
              .forEach(e=>e.classList.remove('active-letter'));
    } else {
      // Show letter
      bigLetter.textContent    = label;
      bigLetter.style.fontSize = '7rem';
      if (wordBadge) wordBadge.style.display = 'none';
      document.querySelectorAll('.asl-letter').forEach(el => {
        el.classList.toggle('active-letter', el.id === `asl-${label}`);
      });
      document.querySelectorAll('.word-card.active-word')
              .forEach(e=>e.classList.remove('active-word'));
    }

    if (statGesture) statGesture.textContent = label;
    if (confValue)   confValue.textContent   = `${pct}%`;
    if (confBar)     confBar.style.width      = `${pct}%`;
  }

  function getWordEmoji(word) {
    const map = {
      Hello:'👋',Bye:'🖐️',Yes:'✊',No:'🚫',ThankYou:'🙏',
      Please:'🤲',Sorry:'😔',Help:'👍',Good:'👌',Bad:'👎',
      ILoveYou:'🤟',Peace:'✌️',Stop:'✋',CallMe:'🤙',More:'🤌',
    };
    return map[word] || '🤟';
  }

  function resetDetection() {
    currentLabel = null; currentType = null;
    updateUI(null,0,'letter','');
  }

  // ── TEXT OPS ──────────────────────────────────────
  function appendToOutput(label, type) {
    if (!label || label==='—') return;
    if (type === 'word') {
      outputText += label + ' ';
    } else {
      outputText += label;
    }
    renderText();
    if (togTTS && togTTS.checked && type==='word') speak(label);
  }

  function renderText() {
    if (translatedText) translatedText.textContent = outputText;
    if (statFrames)     statFrames.textContent = frameCount;
  }

  function speak(text) {
    if (!text || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text.trim());
    u.lang='en-US'; u.rate=0.9;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }

  // ── HISTORY ───────────────────────────────────────
  function saveHistory() {
    const text=outputText.trim(); if(!text) return;
    history.unshift({text, time:new Date().toLocaleTimeString()});
    if(history.length>20) history.pop();
    localStorage.setItem('sb_history',JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    if (!historyLog) return;
    historyLog.innerHTML = '';
    if (!history.length) {
      historyLog.innerHTML='<div class="history-empty">No translations saved yet.</div>';
      return;
    }
    history.forEach(e => {
      const el=document.createElement('div');
      el.className='history-item';
      el.innerHTML=`<span class="history-item__text">${e.text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span>
                    <span class="history-item__time">${e.time}</span>`;
      el.addEventListener('click',()=>{ outputText=e.text; renderText(); });
      historyLog.appendChild(el);
    });
  }

  // ── FPS / STATUS ──────────────────────────────────
  function updateFps() {
    const now=Date.now(), el=now-lastFpsTime;
    if(el>=1000){
      if(fpsCounter) fpsCounter.textContent=`${Math.round(fpsFrames*1000/el)} fps`;
      fpsFrames=0; lastFpsTime=now;
    }
  }

  function setStatus(type,text) {
    if(statusBadge) statusBadge.className=`status-badge status-badge--${type}`;
    if(statusText)  statusText.textContent=text;
  }

  // ── EVENT LISTENERS ───────────────────────────────
  btnStart.addEventListener('click', startCamera);
  btnStop.addEventListener('click',  stopCamera);

  if (btnAddLetter) btnAddLetter.addEventListener('click', () => {
    if (currentLabel) { appendToOutput(currentLabel, currentType||'letter'); accepted=false; }
  });
  if (btnAddSpace) btnAddSpace.addEventListener('click', () => {
    if (outputText && outputText.slice(-1)!==' ') {
      if (togTTS && togTTS.checked) {
        const words=outputText.trim().split(/\s+/);
        speak(words[words.length-1]);
      }
      outputText+=' '; renderText();
    }
  });
  if (btnBackspace)    btnBackspace.addEventListener('click',    ()=>{ outputText=outputText.slice(0,-1); renderText(); });
  if (btnClear)        btnClear.addEventListener('click',        ()=>{ outputText=''; renderText(); });
  if (btnSpeak)        btnSpeak.addEventListener('click',        ()=>speak(outputText));
  if (btnSaveHistory)  btnSaveHistory.addEventListener('click',  saveHistory);
  if (btnClearHistory) btnClearHistory.addEventListener('click', ()=>{ history=[]; localStorage.removeItem('sb_history'); renderHistory(); });

  if (btnCopyText) btnCopyText.addEventListener('click', async ()=>{
    if(!outputText) return;
    try{
      await navigator.clipboard.writeText(outputText);
      btnCopyText.textContent='✅ Copied!';
      setTimeout(()=>{btnCopyText.textContent='📋 Copy';},1500);
    }catch{}
  });

  if (confThreshold) confThreshold.addEventListener('input', ()=>{
    threshold=confThreshold.value/100;
    if(threshVal) threshVal.textContent=confThreshold.value;
  });

  if (togLandmarks) togLandmarks.addEventListener('change', ()=>{
    showLandmarks=togLandmarks.checked;
    if(!showLandmarks) ctx.clearRect(0,0,canvas.width,canvas.height);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
    if(e.key===' ')        { e.preventDefault(); if(outputText&&outputText.slice(-1)!==' '){ outputText+=' '; renderText(); } }
    if(e.key==='Backspace'){ e.preventDefault(); outputText=outputText.slice(0,-1); renderText(); }
    if(e.key==='Enter')    speak(outputText);
    if(e.key==='1')        setMode('letter');
    if(e.key==='2')        setMode('word');
    if(e.key==='3')        setMode('both');
  });

  // ── INIT ──────────────────────────────────────────
  buildGrids();
  renderHistory();
  setMode('letter');
  checkBackend();
  setInterval(checkBackend, 15000);

})();
