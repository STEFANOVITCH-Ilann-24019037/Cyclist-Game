// ===================== script.js =====================
(function(){
  console.log('[Cyclist] script.js loaded');

  const startBtn = document.getElementById('startBtn');
  const msg = document.getElementById('msg');
  const msgTitle = document.getElementById('msgTitle');
  const msgBody = document.getElementById('msgBody');
  const muteBtn = document.getElementById('muteBtn');

  // Debug: check elements
  const missing = [];
  if(!startBtn) missing.push('startBtn');
  if(!msg) missing.push('msg');
  if(!msgTitle) missing.push('msgTitle');
  if(!msgBody) missing.push('msgBody');
  if(!muteBtn) missing.push('muteBtn');
  if(missing.length) console.warn('[Cyclist] éléments manquants:', missing.join(', '));
  else console.log('[Cyclist] tous les éléments UI présents');

  const scoreEl = document.getElementById('score');
  const slopeLabel = document.getElementById('slopeLabel');
  const safeZoneEl = document.getElementById('safeZone');
  const indicatorEl = document.getElementById('indicator');
  const bgHills = document.getElementById('bgHills');

  if(!scoreEl || !slopeLabel || !safeZoneEl || !indicatorEl || !bgHills){
    console.warn('[Cyclist] éléments de jeu manquants:', {
      scoreEl: !!scoreEl,
      slopeLabel: !!slopeLabel,
      safeZoneEl: !!safeZoneEl,
      indicatorEl: !!indicatorEl,
      bgHills: !!bgHills
    });
  }

  // Ensure start message is visible for debugging
  if(msg && msg.classList.contains('hidden')){
    msg.classList.remove('hidden');
    console.log('[Cyclist] message de démarrage affiché pour debug');
  }

  let running = false;
  let soundOn = true;

  // Game state
  let indicator = 0; // -1 (left) .. +1 (right)
  let velocity = 0;   // for smoothing
  let score = 0; // distance in meters
  let speed = 40; // meters per second base
  let elapsed = 0;

  // Outside timer
  let outsideTime = 0;
  const allowedOutside = 1.2; // seconds allowed outside safe zone before crash

  // Terrain / slope system
  const slopes = [
    {name:'Plat', drift:0.02, safeWidth:0.5, minDuration:6, maxDuration:12, weight:60},
    {name:'Petite côte', drift:0.05, safeWidth:0.32, minDuration:5, maxDuration:10, weight:30},
    {name:'Raide', drift:0.12, safeWidth:0.18, minDuration:4, maxDuration:8, weight:10}
  ];

  let currentSlope = slopes[0];
  let slopeEndTime = 0;

  // background scroll
  let bgOffset = 0;

  // Input tracking
  let inputLeft = 0; // A
  let inputRight = 0; // E

  // Audio
  let audioCtx=null;
  function ensureAudio(){
    if(!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  function tickSound(vol=0.04){
    if(!soundOn) return;
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 480;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.06);
  }

  // Utility: choose next slope with increasing difficulty over time
  function pickSlope(){
    const difficulty = Math.min(0.95, score/400); // increases as score grows
    // adjust weights: favor harder slopes as difficulty grows
    const weights = slopes.map(s=>{
      let base = s.weight;
      if(s.name==='Raide') base += Math.round(difficulty*80);
      if(s.name==='Petite côte') base += Math.round(difficulty*30);
      return base;
    });
    const total = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*total;
    for(let i=0;i<weights.length;i++){
      if(r < weights[i]) return slopes[i];
      r -= weights[i];
    }
    return slopes[0];
  }

  function startGame(){
    running = true;
    indicator = 0; velocity = 0; score = 0; elapsed = 0; outsideTime = 0; bgOffset = 0; speed = 40;
    if(indicatorEl) indicatorEl.style.transition = 'left 0.06s linear';
    pickNewSlope(0);
    lastTime = performance.now();
    if(msg) msg.classList.add('hidden');
    loop(lastTime);
    console.log('[Cyclist] jeu démarré');
  }

  function endGame(){
    running = false;
    if(msg) msg.classList.remove('hidden');
    msgTitle.textContent = 'Crash !';
    msgBody.innerHTML = `Distance parcourue: <strong>${Math.round(score)} m</strong><br>Appuie sur Démarrer pour recommencer.`;
    startBtn.textContent = 'Recommencer';
    console.log('[Cyclist] crash, distance =', Math.round(score));
  }

  function pickNewSlope(now){
    currentSlope = pickSlope();
    const dur = currentSlope.minDuration*1000 + Math.random()*(currentSlope.maxDuration-currentSlope.minDuration)*1000;
    slopeEndTime = now + dur;
    if(slopeLabel) slopeLabel.textContent = 'Pente: ' + currentSlope.name;
    // update safe zone width
    const safePct = Math.max(0.08, currentSlope.safeWidth);
    if(safeZoneEl) safeZoneEl.style.width = (safePct*100) + '%';
    console.log('[Cyclist] nouvelle pente:', currentSlope.name, 'largeur safe:', safePct);
  }

  // handle keys
  window.addEventListener('keydown', (e)=>{
    if(e.key.toLowerCase() === 'a') { inputLeft = 1; tickSound(0.03); }
    if(e.key.toLowerCase() === 'e') { inputRight = 1; tickSound(0.03); }
  });
  window.addEventListener('keyup', (e)=>{
    if(e.key.toLowerCase() === 'a') inputLeft = 0;
    if(e.key.toLowerCase() === 'e') inputRight = 0;
  });

  // handle start / mute buttons
  if(startBtn) startBtn.addEventListener('click', ()=>{
    if(!running){ startGame(); }
  });
  if(muteBtn) muteBtn.addEventListener('click', ()=>{
    soundOn = !soundOn; muteBtn.textContent = soundOn ? 'Désactiver son' : 'Activer son';
  });

  // Main loop
  let lastTime = performance.now();
  function loop(now){
    if(!running) return;
    const dt = Math.min(0.05, (now - lastTime)/1000); // cap dt
    lastTime = now;
    elapsed += dt;

    // increase speed slightly with time
    speed += 0.01*dt*speed;
    score += speed*dt;
    if(scoreEl) scoreEl.textContent = `Distance: ${Math.round(score)} m`;

    // slope switching
    if(now > slopeEndTime){ pickNewSlope(now); }

    // compute input force
    const inputForce = (inputRight - inputLeft) * 1.2; // pressing adds instantaneous push
    // slope drift: makes indicator slide (positive drift pushes right)
    const drift = currentSlope.drift * (currentSlope.name === 'Plat' ? 1 : 1.0) * (1 + Math.sin(elapsed*1.2)*0.1);
    // combine to velocity
    // drift pushes indicator away from center (centrifugal), input counteracts it
    velocity += (inputForce - drift * Math.sign(indicator || 0.01)) * dt * 6; // amplify
    // small friction
    velocity *= (1 - Math.min(0.12, dt*3));
    // integrate
    indicator += velocity * dt;
    // clamp
    indicator = Math.max(-1, Math.min(1, indicator));

    // update indicator position in bar (left percent)
    const pct = (indicator + 1)/2*100; // 0..100
    if(indicatorEl) indicatorEl.style.left = pct + '%';

    // update bg scroll to simulate movement. faster when speed higher
    bgOffset = (bgOffset + dt * (speed/80) * 80) % 1600;
    if(bgHills) bgHills.style.backgroundPosition = `${-bgOffset}px 0px`;

    // safe zone detection (purely percentage-based, no layout queries)
    const safePct = Math.max(0.08, currentSlope.safeWidth);
    const safeLeftPct  = 50 - safePct * 50;  // e.g. safePct=0.4 → 30%
    const safeRightPct = 50 + safePct * 50;  // e.g. safePct=0.4 → 70%
    const inside = pct >= safeLeftPct && pct <= safeRightPct;

    if(!inside){
      outsideTime += dt;
    } else {
      outsideTime = Math.max(0, outsideTime - dt*1.6); // recover faster when back in safe
    }

    // fail if outside too long
    if(outsideTime >= allowedOutside){
      // crash!
      if(indicatorEl){ indicatorEl.style.transition = 'left 0.2s ease-out'; }
      endGame();
      return;
    }

    // subtle UI: change safe zone color based on difficulty
    const colorIntensity = Math.min(1, (1 - currentSlope.safeWidth) + (score/4000));
    if(safeZoneEl) safeZoneEl.style.filter = `hue-rotate(${colorIntensity*30}deg)`;

    // schedule next frame
    requestAnimationFrame(loop);
  }

  // show initial message
  if(msg) msg.classList.remove('hidden');
  if(startBtn) startBtn.textContent = 'Démarrer';
  if(muteBtn) muteBtn.textContent = 'Désactiver son';

  // expose for debugging (optional)
  window._game = {start:startGame};
})();
