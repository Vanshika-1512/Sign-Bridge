/**
 * practice.js — SignBridge Practice Mode
 * ALL detection uses ML backend only.
 * Rule-based completely removed.
 * If backend offline — shows clear error, no wrong guesses.
 */
(function () {

  const API_BASE    = 'http://localhost:8000';
  const HOLD_FRAMES = 15;    // frames to hold before accepting
  const MIN_CONF    = 0.45;  // min confidence

  // ── ASL DATA ──────────────────────────────────────
  const LETTERS = 'ABCDEFGHIKLMNOPQRSTUVWXY'.split('');

  const LETTER_HINTS = {
    A:'Fist — thumb rests on the SIDE of index finger',
    B:'Four fingers straight UP together — thumb folded across palm',
    C:'Curve all fingers into a C shape — like holding a cup',
    D:'Index finger points UP — others curl down to touch thumb',
    E:'All fingers hooked/bent down — thumb tucked underneath',
    F:'Index+thumb form circle — other 3 fingers spread UP',
    G:'Index points SIDEWAYS horizontally — thumb parallel',
    H:'Index AND middle point SIDEWAYS together',
    I:'ONLY pinky finger points straight UP — fist otherwise',
    K:'Index UP, middle angled, thumb UP between them',
    L:'Index UP, thumb OUT to side — makes an L shape',
    M:'THREE fingers (index+middle+ring) folded DOWN over thumb',
    N:'TWO fingers (index+middle) folded DOWN over thumb',
    O:'All fingers and thumb curved into a round O',
    P:'Index and middle point DOWNWARD — thumb out',
    Q:'Index and thumb both point DOWNWARD',
    R:'Index and middle CROSSED over each other',
    S:'Fist — thumb crosses OVER the front of all fingers',
    T:'Fist — thumb pokes UP between index and middle',
    U:'Index AND middle UP close together (side by side)',
    V:'Index AND middle UP spread apart — peace sign',
    W:'Index + middle + ring all UP spread apart',
    X:'Index finger HOOKED/bent — not straight up',
    Y:'Thumb OUT to side + ONLY pinky UP — shaka sign',
  };

  const WORD_GESTURES = [
    { word:'Hello',     emoji:'👋', hint:'Open palm facing forward, all fingers spread wide' },
    { word:'Bye',       emoji:'🖐️', hint:'Open hand, fingers close together' },
    { word:'Yes',       emoji:'✊', hint:'Closed fist, nod up and down' },
    { word:'No',        emoji:'🚫', hint:'Index and middle together, tap side to side' },
    { word:'Thank You', emoji:'🙏', hint:'Flat hand from chin moving forward' },
    { word:'Please',    emoji:'🤲', hint:'Flat hand circular on chest' },
    { word:'Sorry',     emoji:'😔', hint:'Fist on chest, circular motion' },
    { word:'Help',      emoji:'👍', hint:'Thumbs up — thumb pointing high' },
    { word:'Good',      emoji:'👌', hint:'OK sign — thumb and index circle, others up' },
    { word:'Bad',       emoji:'👎', hint:'Thumbs down' },
    { word:'I Love You',emoji:'🤟', hint:'Thumb + index + pinky extended — ILY sign' },
    { word:'Peace',     emoji:'✌️', hint:'V sign — index and middle spread, palm forward' },
    { word:'Stop',      emoji:'✋', hint:'Open palm facing outward — halt' },
    { word:'Call Me',   emoji:'🤙', hint:'Thumb and pinky out — phone / shaka sign' },
    { word:'More',      emoji:'🤌', hint:'All fingertips pinched and touching together' },
  ];

  const SPELL_WORDS = ['HELLO','LOVE','SIGN','HAND','LEARN','COOL','FAST','BIRD','CAKE'];

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
  const mlIndicator    = document.getElementById('mlIndicator');
  const mlLabel        = document.getElementById('mlLabel');
  const liveLetterEl   = document.getElementById('liveLetterEl');
  const liveConfBar    = document.getElementById('liveConfBar');
  const liveConfVal    = document.getElementById('liveConfVal');
  const detectionSource= document.getElementById('detectionSource');
  const scoreDisplay   = document.getElementById('scoreDisplay');
  const correctDisplay = document.getElementById('correctDisplay');
  const wrongDisplay   = document.getElementById('wrongDisplay');
  const streakDisplay  = document.getElementById('streakDisplay');
  const accuracyBar    = document.getElementById('accuracyBar');
  const accuracyVal    = document.getElementById('accuracyVal');
  const totalScore     = document.getElementById('totalScore');
  const streakCount    = document.getElementById('streakCount');
  const doneCount      = document.getElementById('doneCount');
  const attemptLog     = document.getElementById('attemptLog');

  // ── State ─────────────────────────────────────────
  let stream        = null;
  let hands         = null;
  let cameraObj     = null;
  let backendOnline = false;
  let modelLoaded   = false;
  let pendingML     = false;
  let currentMode   = 'alphabet';
  let fpsFrames     = 0;
  let lastFpsTime   = Date.now();
  let holdLetter    = null;
  let holdCount     = 0;
  let accepted      = false;

  // Session
  let session = {score:0,correct:0,wrong:0,streak:0,bestStreak:0,attempts:0};
  let letterStats = {};
  LETTERS.forEach(l => { letterStats[l]={correct:0,wrong:0}; });
  let attempts = [];

  // Alphabet mode
  let alphaOrder  = 'sequential';
  let alphaQueue  = [...LETTERS];
  let alphaIndex  = 0;
  let alphaTarget = 'A';

  // Word mode
  let wordQueue = [...WORD_GESTURES];
  let wordIndex = 0;

  // Spelling mode
  let spellWord = 'HELLO';
  let spellPos  = 0;

  // Speed round
  let speedActive   = false;
  let speedTimer    = null;
  let speedSeconds  = 60;
  let speedRemain   = 60;
  let speedScore    = 0;
  let speedCorrect  = 0;
  let speedWrong    = 0;
  let speedStreak   = 0;
  let speedBestStr  = 0;
  let speedCombo    = 1;
  let speedBestCombo= 1;
  let speedTarget   = 'A';
  let speedAccepted = false;

  // Quiz
  const QUIZ_LEN = 10;
  let quizQueue   = [];
  let quizIndex   = 0;
  let quizScore   = 0;
  let quizAnswered= false;

  const shownAchievements = new Set();

  // ── BACKEND CHECK ─────────────────────────────────
  async function checkBackend() {
    try {
      const r = await fetch(`${API_BASE}/api/health`, {signal:AbortSignal.timeout(2000)});
      if (r.ok) {
        const d = await r.json();
        backendOnline = true;
        modelLoaded   = d.model_loaded;
        if (modelLoaded) {
          setMlIndicator('loaded','✅ ML model active');
        } else {
          setMlIndicator('fallback','⚠️ Backend up — no model. Retrain first.');
        }
        return true;
      }
    } catch {
      backendOnline = false;
      modelLoaded   = false;
      setMlIndicator('error','❌ Backend offline — run: python backend/main.py');
    }
    return false;
  }

  function setMlIndicator(cls,text) {
    if (mlIndicator) mlIndicator.className=`ml-indicator ${cls}`;
    if (mlLabel)     mlLabel.textContent=text;
  }

  // ── CALL ML ───────────────────────────────────────
  async function callML(landmarks) {
    if (!backendOnline || !modelLoaded || pendingML) return null;
    pendingML = true;
    try {
      const flat = landmarks.map(lm=>[lm.x,lm.y,lm.z]).flat();
      const r = await fetch(`${API_BASE}/api/predict`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({landmarks:flat}),
        signal:AbortSignal.timeout(400),
      });
      if (r.ok) {
        const d = await r.json();
        return {label:d.letter, confidence:d.confidence, source:'ML Model'};
      }
    } catch {
      backendOnline=false;
      setMlIndicator('error','❌ Backend lost — run: python backend/main.py');
    } finally {
      pendingML=false;
    }
    return null;
  }

  // ── MEDIAPIPE ─────────────────────────────────────
  function initMediaPipe() {
    hands = new Hands({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`});
    hands.setOptions({maxNumHands:1,modelComplexity:1,minDetectionConfidence:0.65,minTrackingConfidence:0.55});
    hands.onResults(onHandResults);
  }

  // ── CAMERA ────────────────────────────────────────
  async function startCamera() {
    const ok = await checkBackend();
    if (!ok || !modelLoaded) {
      alert('ML Backend is offline or model not loaded!\n\nRun in terminal:\n  python backend/main.py\n\nThen click Start Camera again.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'},audio:false});
      video.srcObject=stream; await video.play();
      placeholder.style.display='none'; btnStart.style.display='none'; btnStop.style.display='';
      setStatus('active','Camera active — ML Model');
      video.addEventListener('loadedmetadata',()=>{canvas.width=video.videoWidth;canvas.height=video.videoHeight;});
      if(!hands) initMediaPipe();
      if(typeof Camera!=='undefined'){
        cameraObj=new Camera(video,{onFrame:async()=>{fpsFrames++;updateFps();await hands.send({image:video});},width:640,height:480});
        cameraObj.start();
      } else { processFrames(); }
    } catch(e){ setStatus('error','Camera denied'); alert('Camera access denied.'); }
  }

  function stopCamera() {
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
    if(cameraObj){cameraObj.stop();cameraObj=null;}
    video.srcObject=null; ctx.clearRect(0,0,canvas.width,canvas.height);
    placeholder.style.display=''; btnStart.style.display=''; btnStop.style.display='none';
    setStatus('idle','Camera off'); resetLive();
  }

  async function processFrames() {
    if(!stream)return;
    fpsFrames++; updateFps();
    if(hands&&video.readyState===4) await hands.send({image:video});
    requestAnimationFrame(processFrames);
  }

  // ── HAND RESULTS ──────────────────────────────────
  async function onHandResults(results) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!results.multiHandLandmarks||results.multiHandLandmarks.length===0){
      resetLive(); holdLetter=null; holdCount=0; return;
    }
    const landmarks=results.multiHandLandmarks[0];
    drawSkeleton(landmarks);

    if(!backendOnline||!modelLoaded){
      updateLive(null,0,'❌ Backend offline'); holdLetter=null; holdCount=0; return;
    }

    const result = await callML(landmarks);
    if(!result||!result.label||result.confidence<MIN_CONF){
      holdLetter=null; holdCount=0; resetLive(); return;
    }

    updateLive(result.label, result.confidence, result.source);

    // Hold logic
    if(result.label===holdLetter){ holdCount++; }
    else{ holdLetter=result.label; holdCount=1; }

    if(holdCount>=HOLD_FRAMES&&!accepted){
      holdCount=0;
      dispatch(result.label, result.confidence, result.source);
    }
  }

  function dispatch(label,conf,source){
    if(currentMode==='alphabet') handleAlpha(label,conf,source);
    else if(currentMode==='words') handleWord(label,conf,source);
    else if(currentMode==='spelling') handleSpell(label,conf,source);
    else if(currentMode==='speed') handleSpeed(label,conf,source);
  }

  // ── SKELETON ──────────────────────────────────────
  const CONN=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
  function drawSkeleton(lms){
    const W=canvas.width,H=canvas.height;
    ctx.strokeStyle='rgba(129,140,248,.85)';ctx.lineWidth=2;
    CONN.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(lms[a].x*W,lms[a].y*H);ctx.lineTo(lms[b].x*W,lms[b].y*H);ctx.stroke();});
    lms.forEach((lm,i)=>{const tip=[4,8,12,16,20].includes(i);ctx.beginPath();ctx.arc(lm.x*W,lm.y*H,tip?7:4,0,2*Math.PI);ctx.fillStyle=tip?'#818cf8':'#c7d2fe';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();});
  }

  // ── LIVE DETECTION ────────────────────────────────
  function updateLive(label,conf,source){
    if(liveLetterEl) liveLetterEl.textContent=label||'—';
    const pct=Math.round((conf||0)*100);
    if(liveConfBar) liveConfBar.style.width=`${pct}%`;
    if(liveConfVal) liveConfVal.textContent=`${pct}%`;
    if(detectionSource) detectionSource.textContent=`Source: ${source||'—'}`;
  }
  function resetLive(){updateLive(null,0,'—');}

  // ── SESSION STATS ─────────────────────────────────
  function addResult(correct){
    session.attempts++;
    if(correct){
      session.correct++;
      session.streak++;
      session.score+=10*Math.max(1,session.streak);
      if(session.streak>session.bestStreak)session.bestStreak=session.streak;
    } else {
      session.wrong++;session.streak=0;
    }
    updateSessionUI();
    checkAchievements();
  }

  function updateSessionUI(){
    if(scoreDisplay)   scoreDisplay.textContent=session.score;
    if(correctDisplay) correctDisplay.textContent=session.correct;
    if(wrongDisplay)   wrongDisplay.textContent=session.wrong;
    if(streakDisplay)  streakDisplay.textContent=session.bestStreak;
    if(totalScore)     totalScore.textContent=session.score;
    if(streakCount)    streakCount.textContent=session.streak;
    if(doneCount)      doneCount.textContent=session.correct;
    const acc=session.attempts?Math.round(session.correct/session.attempts*100):0;
    if(accuracyBar) accuracyBar.style.width=`${acc}%`;
    if(accuracyVal) accuracyVal.textContent=`${acc}%`;
  }

  // ── ATTEMPT LOG ───────────────────────────────────
  function logAttempt(target,got,conf,source,correct){
    attempts.unshift({target,got,conf,source,correct,time:new Date().toLocaleTimeString()});
    if(attempts.length>50)attempts.pop();
    renderLog();
  }

  function renderLog(){
    if(!attemptLog)return;
    attemptLog.innerHTML='';
    if(!attempts.length){attemptLog.innerHTML='<div class="history-empty">No attempts yet.</div>';return;}
    attempts.slice(0,25).forEach(a=>{
      const el=document.createElement('div');
      el.className=`attempt-entry ${a.correct?'correct':'wrong'}`;
      el.innerHTML=`<span class="attempt-entry__icon">${a.correct?'✅':'❌'}</span>
        <span class="attempt-entry__target">${a.target}</span>
        <span class="attempt-entry__got">${a.got?`→ ${a.got}`:'→ none'}</span>
        <span class="attempt-entry__conf">${Math.round((a.conf||0)*100)}%</span>
        <span class="attempt-entry__source">${a.source||''}</span>`;
      attemptLog.appendChild(el);
    });
  }

  // ── FEEDBACK ──────────────────────────────────────
  function showFeedback(zoneId,correct,target,got,conf){
    const z=document.getElementById(zoneId); if(!z)return;
    z.className=`feedback-zone ${correct?'correct-zone':'wrong-zone'}`;
    z.innerHTML=`<div class="feedback-result">
      <div class="feedback-result__icon">${correct?'✅':'❌'}</div>
      <div class="feedback-result__main">${correct?`Correct! "${target}"`:`Expected "${target}", got "${got||'nothing'}"`}</div>
      <div class="feedback-result__sub">${correct?'Great job!':'Check the hint and try again.'}</div>
      <div class="feedback-result__conf" style="color:${correct?'#22c55e':'#ef4444'}">ML Confidence: ${Math.round((conf||0)*100)}%</div>
    </div>`;
  }

  function resetFeedback(zoneId){
    const z=document.getElementById(zoneId); if(!z)return;
    z.className='feedback-zone';
    z.innerHTML='<div class="feedback-waiting"><div class="feedback-waiting__icon">👀</div><p>Show the gesture to the camera</p></div>';
  }

  function showFlash(correct,label){
    const fl=document.getElementById('resultFlash');
    const fi=document.getElementById('resultFlashIcon');
    const ft=document.getElementById('resultFlashText');
    if(!fl)return;
    fl.style.display='flex'; fl.className=`result-flash ${correct?'correct-flash':'wrong-flash'}`;
    if(fi) fi.textContent=correct?'✅':'❌';
    if(ft) ft.textContent=correct?`"${label}" — Correct!`:'Try again';
    setTimeout(()=>{fl.style.display='none';fl.className='result-flash';},900);
  }

  // ── ACHIEVEMENTS ──────────────────────────────────
  const ACHIEVEMENTS=[
    {id:'s3',  check:()=>session.streak===3,  icon:'🔥',title:'On Fire!',    sub:'3 correct in a row'},
    {id:'s5',  check:()=>session.streak===5,  icon:'⚡',title:'5 Streak!',   sub:'Keep going'},
    {id:'s10', check:()=>session.streak===10, icon:'🏆',title:'Legend!',     sub:'10 streak'},
    {id:'c10', check:()=>session.correct===10,icon:'🎯',title:'10 Correct!', sub:'Sharp hands'},
    {id:'p100',check:()=>session.score>=100,  icon:'💯',title:'100 Points!', sub:'Nice score'},
  ];
  function checkAchievements(){
    ACHIEVEMENTS.forEach(a=>{
      if(!shownAchievements.has(a.id)&&a.check()){
        shownAchievements.add(a.id); showToast(a);
      }
    });
  }
  function showToast({icon,title,sub}){
    const area=document.getElementById('achievementArea'); if(!area)return;
    const t=document.createElement('div');
    t.className='achievement-toast';
    t.innerHTML=`<div class="achievement-toast__icon">${icon}</div>
      <div class="achievement-toast__text"><strong>${title}</strong><span>${sub}</span></div>`;
    area.appendChild(t);
    setTimeout(()=>{t.classList.add('hide');setTimeout(()=>t.remove(),400);},3000);
  }

  // ── LETTER PROGRESS GRID ──────────────────────────
  function buildLetterGrid(){
    const grid=document.getElementById('letterProgressGrid'); if(!grid)return;
    grid.innerHTML=LETTERS.map(l=>`<div class="lp-cell" id="lp-${l}">${l}</div>`).join('');
  }
  function updateLetterCell(letter){
    const cell=document.getElementById(`lp-${letter}`); if(!cell)return;
    const s=letterStats[letter];
    if(s.correct>0) cell.className='lp-cell correct';
    else if(s.wrong>0) cell.className='lp-cell wrong';
  }
  buildLetterGrid();

  // ════════════════════════════════════════════════
  // ALPHABET MODE
  // ════════════════════════════════════════════════
  function initAlpha(){
    alphaQueue = alphaOrder==='random' ? [...LETTERS].sort(()=>Math.random()-.5) : [...LETTERS];
    alphaIndex=0; showAlphaTarget();
  }

  function showAlphaTarget(){
    accepted=false; holdLetter=null; holdCount=0;
    alphaTarget=alphaQueue[alphaIndex%alphaQueue.length];
    const tl=document.getElementById('targetLetter');
    const th=document.getElementById('targetHint');
    const bn=document.getElementById('btnNextLetter');
    const bs=document.getElementById('btnSkipLetter');
    if(tl) tl.textContent=alphaTarget;
    if(th) th.textContent=LETTER_HINTS[alphaTarget]||'';
    if(bn) bn.style.display='none';
    if(bs) bs.style.display='';
    document.querySelectorAll('.lp-cell').forEach(c=>c.classList.remove('current'));
    const cell=document.getElementById(`lp-${alphaTarget}`);
    if(cell&&!cell.classList.contains('correct')&&!cell.classList.contains('wrong')) cell.classList.add('current');
    resetFeedback('feedbackZone');
  }

  function handleAlpha(label,conf,source){
    if(accepted)return;
    const correct=label===alphaTarget;
    accepted=true;
    showFeedback('feedbackZone',correct,alphaTarget,label,conf);
    showFlash(correct,alphaTarget);
    addResult(correct);
    letterStats[alphaTarget][correct?'correct':'wrong']++;
    updateLetterCell(alphaTarget);
    logAttempt(alphaTarget,label,conf,source,correct);
    if(correct){
      const bn=document.getElementById('btnNextLetter');
      const bs=document.getElementById('btnSkipLetter');
      if(bn)bn.style.display=''; if(bs)bs.style.display='none';
      setTimeout(()=>{if(currentMode==='alphabet')advanceAlpha();},1400);
    } else {
      setTimeout(()=>{accepted=false;holdLetter=null;holdCount=0;resetFeedback('feedbackZone');},1600);
    }
  }

  function advanceAlpha(){
    alphaIndex++;
    if(alphaIndex>=alphaQueue.length){alphaIndex=0;if(alphaOrder==='random')alphaQueue.sort(()=>Math.random()-.5);}
    showAlphaTarget();
  }

  const btnNL=document.getElementById('btnNextLetter');
  const btnSL=document.getElementById('btnSkipLetter');
  const btnRL=document.getElementById('btnRepeatLetter');
  const btnOS=document.getElementById('btnOrderSeq');
  const btnOR=document.getElementById('btnOrderRand');
  if(btnNL) btnNL.addEventListener('click',advanceAlpha);
  if(btnSL) btnSL.addEventListener('click',()=>{logAttempt(alphaTarget,'skip',0,'—',false);advanceAlpha();});
  if(btnRL) btnRL.addEventListener('click',showAlphaTarget);
  if(btnOS) btnOS.addEventListener('click',()=>{alphaOrder='sequential';btnOS.classList.add('active');if(btnOR)btnOR.classList.remove('active');initAlpha();});
  if(btnOR) btnOR.addEventListener('click',()=>{alphaOrder='random';btnOR.classList.add('active');if(btnOS)btnOS.classList.remove('active');initAlpha();});

  // ════════════════════════════════════════════════
  // WORD MODE
  // ════════════════════════════════════════════════
  function initWords(){wordQueue=[...WORD_GESTURES].sort(()=>Math.random()-.5);wordIndex=0;showWordTarget();}

  function showWordTarget(){
    accepted=false;holdLetter=null;holdCount=0;
    const g=wordQueue[wordIndex%wordQueue.length];
    const te=document.getElementById('targetWordEmoji');
    const tw=document.getElementById('targetWord');
    const th=document.getElementById('targetWordHint');
    const bn=document.getElementById('btnNextWord');
    const bs=document.getElementById('btnSkipWord');
    if(te)te.textContent=g.emoji;
    if(tw)tw.textContent=g.word;
    if(th)th.textContent=g.hint;
    if(bn)bn.style.display='none';
    if(bs)bs.style.display='';
    resetFeedback('feedbackZoneWord');
  }

  function handleWord(label,conf,source){
    if(accepted)return;
    const target=wordQueue[wordIndex%wordQueue.length];
    const correct=label===target.word;
    accepted=true;
    showFeedback('feedbackZoneWord',correct,target.word,label,conf);
    showFlash(correct,target.word);
    addResult(correct);logAttempt(target.word,label,conf,source,correct);
    if(correct){
      const bn=document.getElementById('btnNextWord');if(bn)bn.style.display='';
      setTimeout(()=>{if(currentMode==='words')advanceWord();},1400);
    } else {
      setTimeout(()=>{accepted=false;holdLetter=null;holdCount=0;resetFeedback('feedbackZoneWord');},1600);
    }
  }

  function advanceWord(){wordIndex=(wordIndex+1)%wordQueue.length;showWordTarget();}
  const btnNW=document.getElementById('btnNextWord');
  const btnSW=document.getElementById('btnSkipWord');
  if(btnNW)btnNW.addEventListener('click',advanceWord);
  if(btnSW)btnSW.addEventListener('click',()=>{logAttempt(wordQueue[wordIndex%wordQueue.length].word,'skip',0,'—',false);advanceWord();});

  // ════════════════════════════════════════════════
  // SPELLING MODE
  // ════════════════════════════════════════════════
  function initSpelling(){
    const chips=document.getElementById('spellWordChips');
    if(chips){
      chips.innerHTML=SPELL_WORDS.map(w=>`<button class="spell-chip${w===spellWord?' active':''}" data-word="${w}">${w}</button>`).join('');
      chips.querySelectorAll('.spell-chip').forEach(btn=>{
        btn.addEventListener('click',()=>{
          spellWord=btn.dataset.word;
          chips.querySelectorAll('.spell-chip').forEach(b=>b.classList.remove('active'));
          btn.classList.add('active');startSpelling();
        });
      });
    }
    startSpelling();
  }

  function startSpelling(){
    spellPos=0;accepted=false;holdLetter=null;holdCount=0;
    const tgt=document.getElementById('spellTargetWord');
    const chars=document.getElementById('spellChars');
    if(tgt)tgt.textContent=spellWord;
    if(chars)chars.innerHTML=spellWord.split('').map((c,i)=>`<div class="spell-char ${i===0?'current':''}" id="sc-${i}"><span>${c}</span></div>`).join('');
    updateSpellPrompt();resetFeedback('feedbackZoneSpell');
  }

  function updateSpellPrompt(){
    const el=document.getElementById('spellCurrentLetter');
    if(el)el.textContent=spellWord[spellPos]||'—';
    spellWord.split('').forEach((_,i)=>{
      const cell=document.getElementById(`sc-${i}`);if(!cell)return;
      if(i<spellPos)cell.className='spell-char done';
      else if(i===spellPos)cell.className='spell-char current';
      else cell.className='spell-char';
    });
  }

  function handleSpell(label,conf,source){
    if(accepted)return;
    const targetChar=spellWord[spellPos];
    const correct=label===targetChar;
    accepted=true;
    showFeedback('feedbackZoneSpell',correct,targetChar,label,conf);
    showFlash(correct,targetChar);
    addResult(correct);
    if(targetChar){letterStats[targetChar]&&(letterStats[targetChar][correct?'correct':'wrong']++);}
    logAttempt(targetChar,label,conf,source,correct);
    if(correct){
      const cell=document.getElementById(`sc-${spellPos}`);if(cell)cell.className='spell-char done';
      spellPos++;
      if(spellPos>=spellWord.length){
        showToast({icon:'🎉',title:'Word Complete!',sub:`You spelled "${spellWord}"!`});
        setTimeout(()=>startSpelling(),2000);
      } else {
        setTimeout(()=>{accepted=false;holdLetter=null;holdCount=0;updateSpellPrompt();resetFeedback('feedbackZoneSpell');},700);
      }
    } else {
      const cell=document.getElementById(`sc-${spellPos}`);
      if(cell){cell.className='spell-char wrong';setTimeout(()=>{cell.className='spell-char current';},500);}
      setTimeout(()=>{accepted=false;holdLetter=null;holdCount=0;resetFeedback('feedbackZoneSpell');},1400);
    }
  }

  const btnRS=document.getElementById('btnResetSpell');
  const btnNS=document.getElementById('btnNewSpellWord');
  const btnCW=document.getElementById('btnSetCustomWord');
  if(btnRS)btnRS.addEventListener('click',startSpelling);
  if(btnNS)btnNS.addEventListener('click',()=>{const r=SPELL_WORDS.filter(w=>w!==spellWord);spellWord=r[Math.floor(Math.random()*r.length)];initSpelling();});
  if(btnCW)btnCW.addEventListener('click',()=>{
    const val=document.getElementById('customWordInput').value.trim().toUpperCase().replace(/[^A-Z]/g,'');
    const supported=val.split('').filter(c=>LETTERS.includes(c)).join('');
    if(!supported.length){alert('Use supported ASL letters (A-Y, no J or Z)');return;}
    spellWord=supported;document.getElementById('customWordInput').value='';startSpelling();
  });

  // ════════════════════════════════════════════════
  // SPEED ROUND
  // ════════════════════════════════════════════════
  function pickSpeedTarget(){
    const rest=LETTERS.filter(l=>l!==speedTarget);
    speedTarget=rest[Math.floor(Math.random()*rest.length)];
    const el=document.getElementById('speedTarget');if(el)el.textContent=speedTarget;
    speedAccepted=false;
  }

  function startSpeedRound(){
    speedSeconds=parseInt(document.getElementById('speedDuration').value);
    speedRemain=speedSeconds;speedScore=0;speedCorrect=0;speedWrong=0;
    speedStreak=0;speedBestStr=0;speedCombo=1;speedBestCombo=1;
    speedActive=true;speedAccepted=false;
    document.getElementById('speedSetup').style.display='none';
    document.getElementById('speedResults').style.display='none';
    document.getElementById('speedGame').style.display='';
    document.getElementById('speedCombo').style.display='none';
    pickSpeedTarget();updateSpeedUI();
    speedTimer=setInterval(()=>{speedRemain--;updateSpeedUI();if(speedRemain<=0)endSpeedRound();},1000);
  }

  function updateSpeedUI(){
    const te=document.getElementById('speedTimer');
    if(te){te.textContent=speedRemain;te.className=`speed-timer${speedRemain<=10?' urgent':''}`;};
    const se=document.getElementById('speedScore');if(se)se.textContent=speedScore;
    const fill=document.getElementById('speedTimerFill');
    if(fill)fill.style.width=`${(speedRemain/speedSeconds)*100}%`;
  }

  function endSpeedRound(){
    clearInterval(speedTimer);speedActive=false;
    document.getElementById('speedGame').style.display='none';
    document.getElementById('speedResults').style.display='';
    const fs=document.getElementById('speedFinalScore');if(fs)fs.textContent=`${speedScore} pts`;
    const sc=document.getElementById('speedCorrectFinal');if(sc)sc.textContent=speedCorrect;
    const sw=document.getElementById('speedWrongFinal');if(sw)sw.textContent=speedWrong;
    const ss=document.getElementById('speedBestStreak');if(ss)ss.textContent=speedBestStr;
    const sm=document.getElementById('speedBestCombo');if(sm)sm.textContent=`×${speedBestCombo}`;
    session.score+=speedScore;session.correct+=speedCorrect;session.wrong+=speedWrong;
    session.attempts+=speedCorrect+speedWrong;
    if(speedBestStr>session.bestStreak)session.bestStreak=speedBestStr;
    updateSessionUI();
  }

  function handleSpeed(label,conf,source){
    if(!speedActive||speedAccepted)return;
    const correct=label===speedTarget;
    speedAccepted=true;showFlash(correct,speedTarget);
    logAttempt(speedTarget,label,conf,source,correct);
    if(correct){
      speedStreak++;speedCorrect++;
      if(speedStreak>speedBestStr)speedBestStr=speedStreak;
      if(speedStreak>=3){speedCombo=Math.min(4,1+Math.floor(speedStreak/3));if(speedCombo>speedBestCombo)speedBestCombo=speedCombo;}
      speedScore+=10*speedCombo;
      const se=document.getElementById('speedScore');if(se)se.textContent=speedScore;
      if(speedCombo>1){const cm=document.getElementById('speedCombo');if(cm){cm.style.display='block';const mul=document.getElementById('comboMult');if(mul)mul.textContent=speedCombo;}}
      setTimeout(()=>{if(speedActive)pickSpeedTarget();},350);
    } else {
      speedStreak=0;speedWrong++;speedCombo=1;
      const cm=document.getElementById('speedCombo');if(cm)cm.style.display='none';
      setTimeout(()=>{speedAccepted=false;},700);
    }
  }

  const btnSS=document.getElementById('btnStartSpeed');const btnPA=document.getElementById('btnPlayAgain');
  if(btnSS)btnSS.addEventListener('click',startSpeedRound);
  if(btnPA)btnPA.addEventListener('click',()=>{document.getElementById('speedResults').style.display='none';document.getElementById('speedSetup').style.display='';});

  // ════════════════════════════════════════════════
  // QUIZ MODE
  // ════════════════════════════════════════════════
  function initQuiz(){
    quizQueue=[...LETTERS].sort(()=>Math.random()-.5).slice(0,QUIZ_LEN);
    quizIndex=0;quizScore=0;quizAnswered=false;
    const qr=document.getElementById('quizResults');if(qr)qr.style.display='none';
    const qt=document.getElementById('quizTotal');if(qt)qt.textContent=QUIZ_LEN;
    showQuizQ();
  }

  function showQuizQ(){
    quizAnswered=false;
    const letter=quizQueue[quizIndex];
    const tl=document.getElementById('quizTarget');if(tl)tl.textContent=letter;
    const th=document.getElementById('quizHint');if(th)th.textContent=LETTER_HINTS[letter]||'';
    const qc=document.getElementById('quizCurrent');if(qc)qc.textContent=quizIndex+1;
    const pf=document.getElementById('quizProgressFill');if(pf)pf.style.width=`${(quizIndex/QUIZ_LEN)*100}%`;
    const bn=document.getElementById('btnQuizNext');if(bn)bn.style.display='none';
    const fb=document.getElementById('quizFeedback');if(fb)fb.style.display='none';
    const wrong=LETTERS.filter(l=>l!==letter).sort(()=>Math.random()-.5).slice(0,3);
    const opts=[letter,...wrong].sort(()=>Math.random()-.5);
    const con=document.getElementById('quizOptions');
    if(con){
      con.innerHTML=opts.map(o=>`<button class="quiz-opt" data-letter="${o}">${o}</button>`).join('');
      con.querySelectorAll('.quiz-opt').forEach(btn=>{btn.addEventListener('click',()=>{if(!quizAnswered)handleQuizAnswer(btn.dataset.letter,letter);});});
    }
  }

  function handleQuizAnswer(chosen,correct){
    quizAnswered=true;const isCorrect=chosen===correct;if(isCorrect)quizScore++;
    document.querySelectorAll('.quiz-opt').forEach(btn=>{
      btn.classList.add('answered');
      if(btn.dataset.letter===correct)btn.classList.add('correct-ans');
      else if(btn.dataset.letter===chosen&&!isCorrect)btn.classList.add('wrong-ans');
    });
    const fb=document.getElementById('quizFeedback');
    if(fb){fb.style.display='';fb.className=`quiz-feedback ${isCorrect?'correct':'wrong'}`;
    fb.textContent=isCorrect?`✅ Correct! — ${LETTER_HINTS[correct]}`:`❌ That was "${correct}". ${LETTER_HINTS[correct]}`;}
    const bn=document.getElementById('btnQuizNext');if(bn)bn.style.display='';
    addResult(isCorrect);
  }

  const btnQN=document.getElementById('btnQuizNext');const btnQR=document.getElementById('btnQuizRestart');
  if(btnQN)btnQN.addEventListener('click',()=>{
    quizIndex++;
    if(quizIndex>=QUIZ_LEN){
      const qr=document.getElementById('quizResults');if(qr)qr.style.display='';
      const pf=document.getElementById('quizProgressFill');if(pf)pf.style.width='100%';
      const pct=Math.round(quizScore/QUIZ_LEN*100);
      const em=document.getElementById('quizResultEmoji');if(em)em.textContent=pct===100?'🏆':pct>=80?'🎉':pct>=60?'😊':'📚';
      const sc=document.getElementById('quizResultScore');if(sc)sc.textContent=`${quizScore} / ${QUIZ_LEN} correct`;
      const mg=document.getElementById('quizResultMsg');if(mg)mg.textContent=pct===100?'Perfect!':pct>=80?'Excellent!':pct>=60?'Good work!':'Keep practicing!';
    } else {showQuizQ();}
  });
  if(btnQR)btnQR.addEventListener('click',initQuiz);

  // ── MODE SWITCH ───────────────────────────────────
  const panels={alphabet:'panelAlphabet',words:'panelWords',spelling:'panelSpelling',speed:'panelSpeed',quiz:'panelQuiz'};
  const inits={alphabet:initAlpha,words:initWords,spelling:initSpelling,
    speed:()=>{document.getElementById('speedSetup').style.display='';document.getElementById('speedGame').style.display='none';document.getElementById('speedResults').style.display='none';},
    quiz:initQuiz};

  function switchMode(mode){
    if(speedActive){clearInterval(speedTimer);speedActive=false;}
    currentMode=mode;accepted=false;holdLetter=null;holdCount=0;
    Object.values(panels).forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
    const panel=document.getElementById(panels[mode]);if(panel)panel.style.display='';
    document.querySelectorAll('.exercise-tab').forEach(t=>t.classList.remove('active'));
    document.querySelector(`[data-mode="${mode}"]`)?.classList.add('active');
    if(inits[mode])inits[mode]();
  }
  document.querySelectorAll('.exercise-tab').forEach(tab=>{tab.addEventListener('click',()=>switchMode(tab.dataset.mode));});

  // ── SESSION RESET ─────────────────────────────────
  const btnResetSession=document.getElementById('btnResetSession');
  const btnClearLog=document.getElementById('btnClearLog');
  if(btnResetSession)btnResetSession.addEventListener('click',()=>{
    if(confirm('Reset all session stats?')){
      session={score:0,correct:0,wrong:0,streak:0,bestStreak:0,attempts:0};
      LETTERS.forEach(l=>{letterStats[l]={correct:0,wrong:0};});
      attempts=[];renderLog();updateSessionUI();buildLetterGrid();
    }
  });
  if(btnClearLog)btnClearLog.addEventListener('click',()=>{attempts=[];renderLog();});

  // ── FPS / STATUS ──────────────────────────────────
  function updateFps(){
    const now=Date.now(),el=now-lastFpsTime;
    if(el>=1000){if(fpsCounter)fpsCounter.textContent=`${Math.round(fpsFrames*1000/el)} fps`;fpsFrames=0;lastFpsTime=now;}
  }
  function setStatus(type,text){
    if(statusBadge)statusBadge.className=`status-badge status-badge--${type}`;
    if(statusText)statusText.textContent=text;
  }

  // ── CAMERA BUTTONS ────────────────────────────────
  if(btnStart)btnStart.addEventListener('click',startCamera);
  if(btnStop) btnStop.addEventListener('click',stopCamera);

  // ── INIT ──────────────────────────────────────────
  checkBackend();
  switchMode('alphabet');
  setInterval(checkBackend,15000);

})();
