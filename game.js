/* Air Rush: browser UI, keyboard controls, canvas rendering, and optional audio.
 * No packages, remote assets, or build step. Open index.html in a browser.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const canvas = $("table");
  const ctx = canvas.getContext("2d");
  const keys = new Set();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const storageKey = "air-rush-settings-v1";
  const speedValues = [0.65, 1, 1.4];
  const speedLabels = ["Slow", "Normal", "Fast"];
  let selectedMode = "bot";
  let soundEnabled = true;
  let audioContext;
  let lastHitSound = 0;
  let lastFrame = performance.now();
  let overlayKey = "";
  let lastState = "idle";
  let lastScorer = 0;
  let rushFlash = 0;
  let pendingAction = null;
  let trail = [];
  let particles = [];

  function text(id, value) {
    if ($(id).textContent !== String(value)) $(id).textContent = value;
  }
  function announce(message) { text("announcer", message); }
  function opponentName() { return selectedMode === "bot" ? "Bot" : "Player 2"; }
  function nameOf(index) { return index === 0 ? "Player 1" : opponentName(); }

  // The audio context starts only after a user gesture.
  function enableAudio() {
    if (!soundEnabled) return;
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    } catch (_) { /* Sound is optional; the match remains playable. */ }
  }
  function tone(frequency, duration = 0.07, delay = 0, volume = 0.045, kind = "sine") {
    if (!soundEnabled || !audioContext || audioContext.state !== "running") return;
    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = kind;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(start); oscillator.stop(start + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function burst(x, y, color, amount = 12) {
    if (reducedMotion.matches) return;
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 120;
      particles.push({x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, life: 0.35 + Math.random()*0.3, color});
    }
    particles = particles.slice(-150);
  }
  const engine = new AirHockeyEngine({onEvent(event) {
    if (event.type === "hit" || event.type === "wall") {
      const now = performance.now();
      if (now-lastHitSound > 35) { tone(event.type === "hit" ? 420 : 190, 0.045, 0, 0.025); lastHitSound=now; }
      if (event.type === "hit") burst(event.x ?? engine.puck.x, event.y ?? engine.puck.y, "#a6faff", 9);
    } else if (event.type === "goal") {
      lastScorer = event.player;
      trail = [];
      burst(300, event.player === 0 ? 22 : 778, event.player === 0 ? "#62e6e9" : "#ef91be", 35);
      tone(440, 0.12); tone(660, 0.2, 0.1);
      announce(nameOf(event.player) + " scores. " + engine.scores[0] + " to " + engine.scores[1] + ".");
    } else if (event.type === "countdown") {
      tone(340, 0.06, 0, 0.025);
    } else if (event.type === "serve") {
      trail = []; tone(700, 0.1); announce("Play.");
    } else if (event.type === "rush-warning") {
      tone(240, 0.15, 0, 0.04, "triangle"); tone(310, 0.15, 0.2, 0.04, "triangle");
      announce("Rush starts in three seconds.");
    } else if (event.type === "rush-start") {
      rushFlash = 1.25; tone(330, 0.12); tone(500, 0.15, 0.1); tone(740, 0.2, 0.2);
      announce("Rush active. Puck speed increased.");
    } else if (event.type === "rush-end") {
      tone(440, 0.12); tone(300, 0.16, 0.12); announce("Rush ended. Normal speed.");
    } else if (event.type === "win") {
      [440, 554, 659, 880].forEach((frequency, i) => tone(frequency, 0.25, i*0.1));
      announce(nameOf(event.player) + " wins, " + engine.scores[0] + " to " + engine.scores[1] + ".");
    }
  }});

  function getConfig() {
    return {
      mode: selectedMode, target: Number($("target").value),
      speed: speedValues[Number($("speed").value)], difficulty: $("difficulty").value,
      rushEnabled: $("rush-enabled").checked, rushMin: Number($("rush-min").value),
      rushMax: Number($("rush-max").value), rushDuration: Number($("rush-duration").value),
      rushBoost: Number($("rush-boost").value)
    };
  }
  function saveSettings() {
    try { localStorage.setItem(storageKey, JSON.stringify({...getConfig(), soundEnabled})); } catch (_) {}
  }
  function restoreSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (!saved || typeof saved !== "object") return;
      selectedMode = saved.mode === "pvp" ? "pvp" : "bot";
      const numeric = [["target","target",1,50],["rush-min","rushMin",5,60],["rush-max","rushMax",5,90],["rush-duration","rushDuration",3,20]];
      numeric.forEach(([id,key,min,max]) => {
        if (Number.isInteger(saved[key]) && saved[key]>=min && saved[key]<=max) $(id).value = saved[key];
      });
      const speedIndex = speedValues.indexOf(saved.speed);
      if (speedIndex>=0) $("speed").value=speedIndex;
      if (["easy","normal","hard"].includes(saved.difficulty)) $("difficulty").value=saved.difficulty;
      if ([1.25,1.5,1.75,2].includes(saved.rushBoost)) $("rush-boost").value=saved.rushBoost;
      if (typeof saved.rushEnabled==="boolean") $("rush-enabled").checked=saved.rushEnabled;
      if (typeof saved.soundEnabled==="boolean") soundEnabled=saved.soundEnabled;
    } catch (_) {}
  }
  function syncSettings() {
    document.querySelectorAll("[data-mode]").forEach(button => {
      const selected = button.dataset.mode === selectedMode;
      button.classList.toggle("selected",selected); button.setAttribute("aria-pressed",selected);
    });
    document.querySelectorAll("[data-target]").forEach(button => {
      const selected = Number(button.dataset.target)===Number($("target").value);
      button.classList.toggle("selected",selected); button.setAttribute("aria-pressed",selected);
    });
    $("difficulty-row").classList.toggle("hidden", selectedMode === "pvp");
    $("difficulty").disabled=selectedMode === "pvp";
    text("speed-value",speedLabels[Number($("speed").value)]);
    text("target-label","FIRST TO " + ($("target").value || "—"));
    text("opponent-name",opponentName().toUpperCase());
    text("mode-label",selectedMode === "bot" ? "SOLO MATCH" : "LOCAL VERSUS");
    $("opponent-controls").innerHTML = selectedMode === "bot"
      ? '<span class="control-dot pink"></span><strong>BOT</strong><span>Computer controlled</span>'
      : '<span class="control-dot pink"></span><strong>P2</strong><kbd>←</kbd><kbd>→</kbd><span>Move</span>';
    canvas.setAttribute("aria-label","Air hockey table. Player 1 uses A and D. " + (selectedMode==="bot" ? "Opponent is the bot." : "Player 2 uses left and right arrows.") + " Escape pauses.");
    $("rush-details").classList.toggle("hidden",!$("rush-enabled").checked);
    ["rush-min","rush-max","rush-duration","rush-boost"].forEach(id => $(id).disabled=!$("rush-enabled").checked);
    $("sound").setAttribute("aria-pressed",soundEnabled);
    $("sound").setAttribute("aria-label",soundEnabled ? "Mute sound" : "Enable sound");
    text("sound",soundEnabled ? "Sound on" : "Sound off");
  }
  function validateSettings() {
    $("rush-max").setCustomValidity("");
    if ($("rush-enabled").checked && Number($("rush-max").value)<Number($("rush-min").value)) {
      $("rush-max").setCustomValidity("Maximum wait must be at least the minimum wait.");
    }
    if (!$("settings").checkValidity()) {
      $("rush-details").open=true;
      $("settings").reportValidity();
      text("form-error","Check the highlighted setting before starting.");
      return false;
    }
    text("form-error","");
    return true;
  }
  function startMatch(usePrevious = false) {
    if (!usePrevious && !validateSettings()) return;
    const config = usePrevious ? {...engine.config} : getConfig();
    selectedMode = config.mode;
    saveSettings(); keys.clear(); trail=[]; particles=[]; rushFlash=0;
    enableAudio(); engine.start(config);
    $("setting-fields").disabled=true; $("start").disabled=true;
    $("start").innerHTML='<span>Match in progress</span><span>•</span>';
    text("settings-note","Pause to restart or change match settings.");
    overlayKey=""; canvas.focus({preventScroll:true});
    if (innerWidth<741) $("table-wrap").scrollIntoView({behavior:reducedMotion.matches ? "instant" : "smooth",block:"center"});
    syncUI();
  }
  function returnToSetup() {
    keys.clear(); trail=[]; particles=[]; rushFlash=0;
    // A fresh engine start is unnecessary until the next match.
    engine.state="idle"; engine.scores=[0,0]; engine.winner=null;
    engine.paddles.forEach(p=>{p.x=300;p.vx=0;});
    engine.puck.x=300; engine.puck.y=400; engine.puck.vx=0; engine.puck.vy=0;
    $("setting-fields").disabled=false; $("start").disabled=false;
    $("start").innerHTML='<span>Start match</span><span aria-hidden="true">↗</span>';
    text("settings-note","One keyboard. Endless rematches.");
    overlayKey=""; syncSettings(); syncUI(); $("start").focus({preventScroll:true});
  }
  function togglePause() {
    if ($("confirm-dialog").open) return;
    keys.clear();
    if (engine.state==="paused") { enableAudio(); engine.resume(); canvas.focus({preventScroll:true}); }
    else if (["playing","countdown","goal"].includes(engine.state)) engine.pause();
    syncUI();
  }
  function confirmAction(action) {
    pendingAction=action;
    text("confirm-title",action==="restart" ? "Start over?" : "Leave this match?");
    text("confirm-copy","Your current score will be cleared.");
    text("confirm-action",action==="restart" ? "Restart" : "Back to setup");
    $("confirm-dialog").returnValue="";
    $("confirm-dialog").showModal();
  }
  $("confirm-dialog").addEventListener("close",()=>{
    if ($("confirm-dialog").returnValue==="confirm") {
      if(pendingAction==="restart") startMatch(true); else returnToSetup();
    }
    pendingAction=null;
  });
  $("settings").addEventListener("submit",event=>{event.preventDefault(); if(engine.state==="idle") startMatch();});
  document.querySelectorAll("[data-mode]").forEach(button=>button.addEventListener("click",()=>{
    selectedMode=button.dataset.mode; syncSettings(); saveSettings(); overlayKey="";
  }));
  document.querySelectorAll("[data-target]").forEach(button=>button.addEventListener("click",()=>{
    $("target").value=button.dataset.target; syncSettings(); saveSettings();
  }));
  $("settings").addEventListener("input",()=>{ $("rush-max").setCustomValidity(""); text("form-error",""); syncSettings(); saveSettings(); });
  $("pause").addEventListener("click",togglePause);
  $("sound").addEventListener("click",()=>{soundEnabled=!soundEnabled;enableAudio();syncSettings();saveSettings();});
  $("overlay-content").addEventListener("click",event=>{
    const button=event.target.closest("[data-action]"); if(!button) return;
    if(button.dataset.action==="resume") togglePause();
    if(button.dataset.action==="restart") confirmAction("restart");
    if(button.dataset.action==="setup") {
      if(engine.state==="finished") returnToSetup(); else confirmAction("setup");
    }
    if(button.dataset.action==="rematch") startMatch(true);
  });
  document.addEventListener("keydown",event=>{
    if (event.code==="Escape" && !$("confirm-dialog").open) {event.preventDefault();if(!event.repeat) togglePause();return;}
    if (["KeyA","KeyD","ArrowLeft","ArrowRight"].includes(event.code) && ["playing","countdown","goal"].includes(engine.state)) {
      event.preventDefault();keys.add(event.code);
    }
  });
  document.addEventListener("keyup",event=>keys.delete(event.code));
  function autoPause() { keys.clear(); if(["playing","countdown","goal"].includes(engine.state)) {engine.pause();syncUI();} }
  window.addEventListener("blur",autoPause);
  document.addEventListener("visibilitychange",()=>{if(document.hidden) autoPause();});
  window.addEventListener("pagehide",saveSettings);

  function updateOverlay() {
    const state=engine.state;
    const key=state==="countdown" ? "countdown:"+Math.ceil(engine.countdown) :
      state==="playing" ? (rushFlash>0 ? "rush" : "play") : state;
    if(key===overlayKey) return;
    overlayKey=key;
    const overlay=$("overlay"), card=$("overlay-content");
    overlay.classList.toggle("hidden",key==="play");
    overlay.classList.toggle("interactive",state==="paused" || state==="finished");
    if(state==="idle") card.innerHTML='<p class="eyebrow">YOUR NEXT RIVALRY STARTS HERE</p><h2>Meet at the<br>center line.</h2><p>Choose your match settings<br>and hit Start match.</p>';
    if(state==="countdown") card.innerHTML='<p class="eyebrow">GET READY</p><div class="count">'+Math.max(1,Math.ceil(engine.countdown))+'</div>';
    if(state==="goal") card.innerHTML='<div class="goal-text '+(lastScorer===1?'p2':'')+'">GOAL</div><p>'+nameOf(lastScorer)+' scores</p>';
    if(state==="paused") card.innerHTML='<p class="eyebrow">TAKE A BREATHER</p><h2>Match paused.</h2><p>Pick up exactly where you left off.</p><div class="overlay-actions"><button class="primary" data-action="resume">Resume match</button><button class="secondary" data-action="restart">Restart match</button><button class="small-button" data-action="setup">Back to setup</button></div>';
    if(state==="finished") card.innerHTML='<p class="eyebrow">THAT’S A WRAP</p><h2>'+nameOf(engine.winner)+' wins!</h2><p>Final score &nbsp; '+engine.scores[0]+' — '+engine.scores[1]+'</p><div class="overlay-actions"><button class="primary" data-action="rematch">Run it back ↗</button><button class="secondary" data-action="setup">Change settings</button></div>';
    if(key==="rush") card.innerHTML='<p class="eyebrow">FEEL THE PACE</p><h2 style="color:var(--orange);font-size:56px">RUSH!</h2>';
    if((state==="paused" || state==="finished") && state!==lastState) card.querySelector("button")?.focus({preventScroll:true});
  }
  function syncUI() {
    text("score-one",String(engine.scores[0]).padStart(2,"0"));
    text("score-two",String(engine.scores[1]).padStart(2,"0"));
    const status={idle:"READY TO PLAY",playing:"MATCH IN PLAY",countdown:"GET READY",goal:"GOAL SCORED",paused:"MATCH PAUSED",finished:"MATCH COMPLETE"};
    text("match-status",status[engine.state] || "READY TO PLAY");
    $("pause").disabled=["idle","finished"].includes(engine.state);
    const pauseLabel=engine.state==="paused" ? "Resume" : "Pause";
    if($("pause").dataset.label!==pauseLabel) {$("pause").innerHTML=pauseLabel+' <kbd>Esc</kbd>';$("pause").dataset.label=pauseLabel;}
    $("table-caption").classList.toggle("hidden",engine.state!=="idle");
    const phase=engine.state==="idle" ? ($("rush-enabled").checked ? "normal" : "off") : engine.rush.phase;
    document.body.dataset.rush=phase;
    const boost=engine.state==="idle" ? Number($("rush-boost").value) : engine.config.rushBoost;
    const percent=Math.round((boost-1)*100);
    if(phase==="off") {text("rush-label","CLASSIC PACE");text("rush-description","Rush is off for this match.");text("rush-time","STEADY");}
    else if(phase==="active") {text("rush-label","RUSH ACTIVE");text("rush-description","Puck +"+percent+"% · Paddles +15%");text("rush-time",Math.ceil(engine.rush.remaining)+"s");}
    else if(phase==="warning") {text("rush-label","RUSH INCOMING");text("rush-description","Hold your line. Speed is about to rise.");text("rush-time",Math.ceil(engine.rush.remaining)+"s");}
    else {text("rush-label","RANDOM RUSH ARMED");text("rush-description","Watch for the amber warning.");text("rush-time","+"+percent+"%");}
    updateOverlay(); lastState=engine.state;
  }

  // Canvas coordinates stay 600 × 800; display size never changes the physics.
  function resizeCanvas() {
    const box=canvas.getBoundingClientRect();
    const scale=Math.min(devicePixelRatio || 1,2);
    canvas.width=Math.max(1,Math.round(box.width*scale));
    canvas.height=Math.max(1,Math.round(box.width*4/3*scale));
    ctx.setTransform(canvas.width/600,0,0,canvas.height/800,0,0);
  }
  function line(x1,y1,x2,y2,color,width=1) {ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function circle(x,y,r,color,fill=false,width=1) {ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.lineWidth=width;if(fill){ctx.fillStyle=color;ctx.fill();}else{ctx.strokeStyle=color;ctx.stroke();}}
  function roundRect(x,y,w,h,r,fill) {ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();}
  function draw() {
    const isRush=engine.state!=="idle" && engine.rush.phase==="active";
    const warning=engine.state!=="idle" && engine.rush.phase==="warning";
    const lineColor=isRush ? "#784029" : "#273b50";
    ctx.clearRect(0,0,600,800);
    const background=ctx.createLinearGradient(0,0,0,800);
    background.addColorStop(0,isRush?"#20181a":"#101b2b");background.addColorStop(.5,isRush?"#19171d":"#0c1522");background.addColorStop(1,isRush?"#1c1b20":"#101e2b");
    roundRect(0,0,600,800,20,background);
    ctx.fillStyle=isRush?"#ffb68012":"#a5d3f512";
    for(let x=34;x<584;x+=24) for(let y=32;y<784;y+=24) {ctx.beginPath();ctx.arc(x,y,.9,0,Math.PI*2);ctx.fill();}
    // Table markings and goal areas.
    line(17,400,583,400,lineColor,2);circle(300,400,76,lineColor,false,2);circle(300,400,5,lineColor,true);
    ctx.beginPath();ctx.arc(300,16,116,0,Math.PI);ctx.strokeStyle=lineColor;ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.arc(300,784,116,Math.PI,Math.PI*2);ctx.stroke();
    const glow=warning || isRush ? "#ff9e57" : "#3c5974";
    ctx.shadowColor=glow;ctx.shadowBlur=isRush?14:5;
    line(16,16,180,16,glow,4);line(420,16,584,16,glow,4);
    line(16,784,180,784,glow,4);line(420,784,584,784,glow,4);
    line(16,16,16,784,glow,4);line(584,16,584,784,glow,4);
    ctx.shadowBlur=14;line(183,9,417,9,"#ef91be",5);line(183,791,417,791,"#62e6e9",5);ctx.shadowBlur=0;
    ctx.fillStyle="#687f984f";ctx.font='10px Consolas,monospace';ctx.textAlign="center";
    ctx.fillText(selectedMode==="bot"?"BOT TERRITORY":"PLAYER 2 TERRITORY",300,153);ctx.fillText("PLAYER 1 TERRITORY",300,652);
    ctx.save();ctx.translate(45,400);ctx.rotate(-Math.PI/2);ctx.fillStyle="#526d854f";ctx.font='9px Consolas,monospace';ctx.fillText("AIR RUSH / ARCADE CLUB",0,0);ctx.restore();
    if(!reducedMotion.matches) trail.forEach((point,i)=>{
      const alpha=(i/trail.length)*.32;ctx.globalAlpha=alpha;
      circle(point.x,point.y,3+7*i/trail.length,isRush?"#ff9e57":"#aeeef8",true);
    });
    ctx.globalAlpha=1;
    engine.paddles.forEach((p,index)=>{
      const color=index===0?"#62e6e9":"#ef91be";
      ctx.shadowColor=color;ctx.shadowBlur=18;
      roundRect(p.x-p.width/2,p.y-p.height/2,p.width,p.height,7,color);ctx.shadowBlur=0;
      roundRect(p.x-p.width/2+9,p.y-2,p.width-18,3,2,index===0?"#d3ffff":"#ffe4f4");
      ctx.fillStyle=index===0?"#315e69":"#634258";
      for(let n=-1;n<=1;n++)roundRect(p.x+n*7-1,p.y+3,2,3,1,ctx.fillStyle);
    });
    const puck=engine.puck;
    ctx.shadowColor=isRush?"#ffb570":"#e3f9ff";ctx.shadowBlur=isRush?25:15;
    circle(puck.x,puck.y,puck.r || 10,isRush?"#ffdfb4":"#edfaff",true);ctx.shadowBlur=0;
    circle(puck.x,puck.y,4,isRush?"#ce7439":"#9bb7ca",true);
    particles.forEach(p=>{ctx.globalAlpha=Math.max(0,Math.min(1,p.life*2));circle(p.x,p.y,2,p.color,true);});
    ctx.globalAlpha=1;
  }
  function frame(now) {
    const dt=Math.max(0,Math.min((now-lastFrame)/1000,0.05));lastFrame=now;
    engine.update(dt,{p1:Number(keys.has("KeyD"))-Number(keys.has("KeyA")),p2:Number(keys.has("ArrowRight"))-Number(keys.has("ArrowLeft"))});
    if(engine.state==="playing") {
      rushFlash=Math.max(0,rushFlash-dt);
      if(!reducedMotion.matches) {trail.push({x:engine.puck.x,y:engine.puck.y});trail=trail.slice(-(engine.rush.phase==="active"?19:10));}
    }
    if(engine.state!=="paused") particles=particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;return p.life>0;});
    syncUI();draw();requestAnimationFrame(frame);
  }
  restoreSettings(); syncSettings(); resizeCanvas(); syncUI();
  new ResizeObserver(resizeCanvas).observe(canvas);
  requestAnimationFrame(frame);
})();


