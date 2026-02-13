// game.js
(() => {
  const arena = document.getElementById("arena");
  const arenaWrap = document.getElementById("arenaWrap");
  const overlay = document.getElementById("overlay");
  const blackout = document.getElementById("blackout");

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");

  const endTitle = document.getElementById("endTitle");
  const endMsg = document.getElementById("endMsg");
  const endScore = document.getElementById("endScore");
  const endBest = document.getElementById("endBest");
  const fineTxt = document.getElementById("fineTxt");

  const playBtn = document.getElementById("playBtn");
  const shareBtn = document.getElementById("shareBtn");
  const resetBtn = document.getElementById("resetBtn");

  const hint = document.getElementById("hint");
  const mini = document.getElementById("mini");

  const dangerFill = document.getElementById("dangerFill");
  const faseTxt = document.getElementById("faseTxt");
  const modoTxt = document.getElementById("modoTxt");

  const timeFill = document.getElementById("timeFill");
  const seedTxt = document.getElementById("seedTxt");

  const soundBtn = document.getElementById("soundBtn");
  const vibeBtn = document.getElementById("vibeBtn");

  // ===== Config =====
  const TILE_COUNT = 22;
  const EDGE_PAD = 10;
  const BEST_KEY = "nter_best_rage_brutal_v1";

  // ===== Helpers =====
  const now = () => performance.now();
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rand = (a, b, r = Math.random()) => a + r * (b - a);
  const randi = (a, b, r = Math.random()) => Math.floor(rand(a, b + 1, r));

  // ===== Reto diario: semilla determinista =====
  function dailySeedStr() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const seedStr = dailySeedStr();
  const rngDaily = mulberry32(hash32(seedStr));
  seedTxt.textContent = `Semilla: ${seedStr}`;

  // ===== Sonido (WebAudio, sin archivos) =====
  let audioCtx = null;
  let sonidoActivo = true;

  function ensureAudio() {
    if (!sonidoActivo) return false;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return true;
  }

  function playBeat(intensidad = 0.5) {
    if (!ensureAudio()) return;
    const t0 = audioCtx.currentTime;

    // golpe grave
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(78, t0);
    osc1.frequency.exponentialRampToValueAtTime(52, t0 + 0.09);
    gain1.gain.setValueAtTime(0.0001, t0);
    gain1.gain.exponentialRampToValueAtTime(0.12 * intensidad, t0 + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
    osc1.connect(gain1).connect(audioCtx.destination);
    osc1.start(t0);
    osc1.stop(t0 + 0.16);

    // click corto
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(145, t0 + 0.12);
    gain2.gain.setValueAtTime(0.0001, t0 + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.07 * intensidad, t0 + 0.13);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.20);
    osc2.connect(gain2).connect(audioCtx.destination);
    osc2.start(t0 + 0.12);
    osc2.stop(t0 + 0.22);
  }

  function playDeath(intensidad = 0.9) {
    if (!ensureAudio()) return;
    const t0 = audioCtx.currentTime;

    // “bajada” + ruido tipo buzz
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(260, t0);
    osc.frequency.exponentialRampToValueAtTime(80, t0 + 0.25);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18 * intensidad, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.30);
  }

  soundBtn.addEventListener("click", () => {
    sonidoActivo = !sonidoActivo;
    soundBtn.textContent = sonidoActivo ? "🔊 Sonido: ON" : "🔇 Sonido: OFF";
    soundBtn.classList.toggle("off", !sonidoActivo);
    if (sonidoActivo) ensureAudio();
  });

  // ===== Vibración =====
  let vibracionActiva = true;
  function vib(pattern) {
    if (!vibracionActiva) return;
    if (!("vibrate" in navigator)) return;
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
  vibeBtn.addEventListener("click", () => {
    vibracionActiva = !vibracionActiva;
    vibeBtn.textContent = vibracionActiva ? "📳 Vibración: ON" : "📴 Vibración: OFF";
    vibeBtn.classList.toggle("off", !vibracionActiva);
  });

  // ===== Estado =====
  let tiles = [];
  let redIndex = 0;
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let playing = false;

  // timers
  let moveTimer = null;
  let redTimer = null;
  let microTimer = null;
  let timeRAF = 0;

  // muerte por tiempo
  let timeLimitMs = 1600;
  let timeLeftMs = 1600;
  let lastTick = 0;

  // latido scheduling
  let nextBeatAt = 0;

  // tracking dedo
  let lastPointer = { x: null, y: null, t: 0 };
  let lastTap = { x: null, y: null, t: 0 };

  // ===== UI helpers =====
  function setOverlay(show) { overlay.classList.toggle("show", show); }
  function updateStats() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
  }
  function updateTimeBar() {
    const pct = clamp((timeLeftMs / timeLimitMs) * 100, 0, 100);
    timeFill.style.width = `${pct}%`;
  }
  function flashBlackout(ms = 120) {
    blackout.classList.add("show");
    setTimeout(() => blackout.classList.remove("show"), ms);
  }
  function shake() {
    arenaWrap.classList.remove("shake");
    // reflow trick
    void arenaWrap.offsetWidth;
    arenaWrap.classList.add("shake");
  }

  function arenaRect() { return arena.getBoundingClientRect(); }
  function getTileSize() {
    const probe = tiles[0]?.el;
    if (!probe) return { w: 88, h: 64 };
    const r = probe.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function randomPosition(rng = Math.random) {
    const rect = arenaRect();
    const { w, h } = getTileSize();
    const maxX = Math.max(0, rect.width - w - EDGE_PAD);
    const maxY = Math.max(0, rect.height - h - EDGE_PAD);
    return { x: randi(EDGE_PAD, maxX, rng()), y: randi(EDGE_PAD, maxY, rng()) };
  }

  function placeTile(i, x, y) {
    const t = tiles[i];
    t.x = x; t.y = y;
    t.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  function nearPointerPosition(px, py, safeRadius, huntRadius, rng = Math.random) {
    const rect = arenaRect();
    const { w, h } = getTileSize();
    const localX = px - rect.left - w / 2;
    const localY = py - rect.top - h / 2;

    const angle = rand(0, Math.PI * 2, rng());
    const radius = rand(safeRadius, huntRadius, rng());

    let x = localX + Math.cos(angle) * radius;
    let y = localY + Math.sin(angle) * radius;

    const maxX = Math.max(0, rect.width - w - EDGE_PAD);
    const maxY = Math.max(0, rect.height - h - EDGE_PAD);

    x = clamp(x, EDGE_PAD, maxX);
    y = clamp(y, EDGE_PAD, maxY);

    return { x: Math.round(x), y: Math.round(y) };
  }

  // ===== Dificultad por fases (BRUTAL) =====
  function getPhaseConfig() {
    const s = score;
    if (s <= 3) {
      return { fase: 1, modo: "Calentamiento", moveTick: 980, redTick: 760, microTick: 0, cheatChance: 0.40,
        safeRadius: 98, huntRadius: 150, nearMissChance: 0.22, fakeRedChance: 0.18, blackoutChance: 0.00, timeLimit: 1700 };
    }
    if (s <= 7) {
      return { fase: 2, modo: "Se pone raro", moveTick: 900, redTick: 680, microTick: 0, cheatChance: 0.62,
        safeRadius: 92, huntRadius: 160, nearMissChance: 0.32, fakeRedChance: 0.28, blackoutChance: 0.12, timeLimit: 1450 };
    }
    if (s <= 11) {
      return { fase: 3, modo: "Rage", moveTick: 830, redTick: 610, microTick: 0, cheatChance: 0.74,
        safeRadius: 86, huntRadius: 170, nearMissChance: 0.44, fakeRedChance: 0.38, blackoutChance: 0.18, timeLimit: 1250 };
    }
    if (s <= 15) {
      return { fase: 4, modo: "Caos real", moveTick: 770, redTick: 560, microTick: 720, cheatChance: 0.83,
        safeRadius: 82, huntRadius: 182, nearMissChance: 0.55, fakeRedChance: 0.48, blackoutChance: 0.28, timeLimit: 1100 };
    }
    return { fase: 5, modo: "Imposible (casi)", moveTick: 720, redTick: 520, microTick: 620, cheatChance: 0.90,
      safeRadius: 78, huntRadius: 192, nearMissChance: 0.66, fakeRedChance: 0.58, blackoutChance: 0.36, timeLimit: 980 };
  }

  function updateDangerUI(cfg) {
    faseTxt.textContent = `Fase: ${cfg.fase}`;
    modoTxt.textContent = `Modo: ${cfg.modo}`;
    const pct = clamp(((cfg.fase - 1) / 4) * 100, 0, 100);
    dangerFill.style.width = `${pct}%`;
  }

  // ===== Taunts =====
  function setRunningTaunt(cfg) {
    const s = score;
    if (s === 0) {
      hint.textContent = "Tocá cualquier botón… pero NO el rojo.";
      mini.textContent = "Si tardás en tocar, perdés. (Sí, en serio.)";
      return;
    }
    if (s === 3) hint.textContent = "Ok… ahora empieza lo feo.";
    if (s === 6) hint.textContent = "Acá muere TODO el mundo.";
    if (s === 9) hint.textContent = "Si perdés ahora… duele.";
    if (s === 12) hint.textContent = "Grabalo. Nadie te va a creer.";
    if (s === 15) hint.textContent = "¿Cómo seguís vivo?";
    if (s >= 16) hint.textContent = "Esto ya es ilegal 😭";
  }

  function endMessages(s) {
    if (s <= 1) return { t: "OUCH", m: "Duraste menos que un parpadeo." };
    if (s <= 3) return { t: "CASI", m: "Una más. No te vas a ir así." };
    if (s <= 6) return { t: "ACÁ MUEREN TODOS", m: "No sos vos. (Sí sos vos.)" };
    if (s <= 9) return { t: "DUELE", m: "Estabas demasiado cerca." };
    if (s <= 12) return { t: "NO TE CREO", m: "Eso ya es nivel TikTok." };
    if (s <= 16) return { t: "¿LEYENDA?", m: "Ok… compartilo YA." };
    return { t: "HACKER", m: "Esto es ridículo. Compartilo." };
  }

  // ===== Distracciones: falsos rojos =====
  function triggerFakeReds(cfg) {
    if (!playing) return;
    const roll = (rngDaily() * 0.7) + (Math.random() * 0.3);
    if (roll > cfg.fakeRedChance) return;

    const count = (cfg.fase >= 4 && ((rngDaily() > 0.55) ? 2 : 1)) ? 2 : 1;
    const picks = [];
    let tries = 0;

    while (picks.length < count && tries < 70) {
      const idx = randi(0, tiles.length - 1, rngDaily());
      if (idx === redIndex) { tries++; continue; }
      if (picks.includes(idx)) { tries++; continue; }
      picks.push(idx);
      tries++;
    }

    for (const idx of picks) tiles[idx].el.classList.add("fakeRed");
    setTimeout(() => {
      for (const idx of picks) tiles[idx].el.classList.remove("fakeRed");
    }, randi(120, 210, rngDaily()));
  }

  // ===== Blackouts =====
  function maybeBlackout(cfg) {
    if (!playing) return;
    if (cfg.blackoutChance <= 0) return;

    const recent = (now() - lastPointer.t) < 650 || (now() - lastTap.t) < 650;
    if (!recent) return;

    const roll = (rngDaily() * 0.65) + (Math.random() * 0.35);
    if (roll < cfg.blackoutChance) {
      flashBlackout(randi(85, 150, rngDaily()));
      if (cfg.fase >= 4) { shake(); vib([20]); } // micro susto
    }
  }

  // ===== Rojo cazador =====
  function repositionRed(cfg, reason = "normal") {
    if (!playing) return;

    const rect = arenaRect();
    if (!rect.width || !rect.height) return;

    const redTile = tiles[redIndex];
    if (!redTile) return;

    const pX = lastPointer.x;
    const pY = lastPointer.y;

    const recentPointer = pX !== null && (now() - lastPointer.t) < 900;
    const recentTap = lastTap.x !== null && (now() - lastTap.t) < 700;

    const huntRoll = (rngDaily() * 0.6) + (Math.random() * 0.4);
    const shouldHunt = recentPointer && huntRoll < cfg.cheatChance;

    if (!shouldHunt) {
      const p = randomPosition(rngDaily);
      placeTile(redIndex, p.x, p.y);
      return;
    }

    let p = nearPointerPosition(pX, pY, cfg.safeRadius, cfg.huntRadius, rngDaily);

    if (recentTap) {
      const p2 = nearPointerPosition(lastTap.x, lastTap.y, cfg.safeRadius, cfg.huntRadius, rngDaily);
      p.x = Math.round(p.x * 0.55 + p2.x * 0.45);
      p.y = Math.round(p.y * 0.55 + p2.y * 0.45);
    }

    placeTile(redIndex, p.x, p.y);

    const nearRoll = (rngDaily() * 0.7) + (Math.random() * 0.3);
    if (reason !== "init" && (recentTap || recentPointer) && nearRoll < cfg.nearMissChance) {
      redTile.el.classList.add("nearMiss");
      setTimeout(() => redTile.el.classList.remove("nearMiss"), 420);
      if (cfg.fase >= 3) vib([12]);
    }
  }

  function chooseNextRedIndex() {
    let idx = randi(0, tiles.length - 1, rngDaily);
    if (idx === redIndex) idx = (idx + 1) % tiles.length;
    return idx;
  }

  function swapRed(cfg) {
    if (!playing) return;

    tiles[redIndex].el.classList.remove("red");
    tiles[redIndex].el.classList.add("safe");

    redIndex = chooseNextRedIndex();

    tiles[redIndex].el.classList.remove("safe");
    tiles[redIndex].el.classList.add("red");

    repositionRed(cfg, "swap");
  }

  function afterTapTrick(cfg) {
    if (!playing) return;

    const roll = (rngDaily() * 0.6) + (Math.random() * 0.4);

    if (cfg.fase >= 3 && roll < 0.26) {
      setTimeout(() => repositionRed(cfg, "afterTap"), randi(55, 110, rngDaily()));
    }
    if (cfg.fase >= 4 && roll < 0.20) {
      setTimeout(() => swapRed(cfg), randi(90, 160, rngDaily()));
    }
  }

  // ===== Movimiento general =====
  function moveAllTiles(cfg) {
    const used = [];
    const { w, h } = getTileSize();

    function ok(x, y) {
      for (const p of used) {
        if (Math.abs(p.x - x) < w * 0.68 && Math.abs(p.y - y) < h * 0.68) return false;
      }
      return true;
    }

    for (let i = 0; i < tiles.length; i++) {
      let tries = 0;
      let p = randomPosition(rngDaily);
      while (!ok(p.x, p.y) && tries < 45) {
        p = randomPosition(rngDaily);
        tries++;
      }
      used.push(p);
      placeTile(i, p.x, p.y);
    }

    triggerFakeReds(cfg);
    maybeBlackout(cfg);
  }

  // ===== Timers =====
  function clearTimers() {
    if (moveTimer) clearInterval(moveTimer);
    if (redTimer) clearInterval(redTimer);
    if (microTimer) clearInterval(microTimer);
    if (timeRAF) cancelAnimationFrame(timeRAF);
    moveTimer = redTimer = microTimer = null;
    timeRAF = 0;
  }

  function applyPhaseTimers() {
    const cfg = getPhaseConfig();
    updateDangerUI(cfg);

    // tiempo por tap
    timeLimitMs = cfg.timeLimit;
    timeLeftMs = timeLimitMs;
    updateTimeBar();

    // latido scheduling
    nextBeatAt = 0;

    clearTimers();

    moveTimer = setInterval(() => {
      const cfg2 = getPhaseConfig();
      moveAllTiles(cfg2);
      repositionRed(cfg2, "moveAll");
    }, cfg.moveTick);

    redTimer = setInterval(() => {
      const cfg2 = getPhaseConfig();
      swapRed(cfg2);
    }, cfg.redTick);

    if (cfg.microTick > 0) {
      microTimer = setInterval(() => {
        const cfg2 = getPhaseConfig();
        repositionRed(cfg2, "micro");
        triggerFakeReds(cfg2);
        maybeBlackout(cfg2);
      }, cfg.microTick);
    }

    // loop de tiempo + latido
    lastTick = now();
    const tick = () => {
      if (!playing) return;
      const t = now();
      const dt = t - lastTick;
      lastTick = t;

      timeLeftMs -= dt;
      if (timeLeftMs <= 0) {
        lose("Te quedaste sin tiempo.");
        return;
      }
      updateTimeBar();

      // Latido: más fuerte y rápido según fase y urgencia
      const cfgB = getPhaseConfig();
      const urgencia = 1 - (timeLeftMs / timeLimitMs); // 0..1
      const intensidad = clamp(0.22 + (cfgB.fase * 0.12) + (urgencia * 0.58), 0.22, 1.0);
      const intervalo = clamp(520 - (cfgB.fase * 55) - (urgencia * 260), 140, 520);

      if (nextBeatAt === 0) nextBeatAt = t; // arranca ya
      if (t >= nextBeatAt) {
        playBeat(intensidad);
        // micro vibración con el latido en fase alta
        if (cfgB.fase >= 4 && urgencia > 0.55) vib([10]);
        nextBeatAt = t + intervalo;
      }

      timeRAF = requestAnimationFrame(tick);
    };
    timeRAF = requestAnimationFrame(tick);
  }

  // ===== Flow =====
  function lose(reason) {
    playing = false;
    clearTimers();

    const msgs = endMessages(score);
    endTitle.textContent = msgs.t;

    const extra =
      score === 0 ? "Ni calentaste 😭" :
      score < 5 ? "Una más. Literal." :
      score < 10 ? "Esto duele porque estabas bien." :
      "Ok… eso fue demasiado.";

    endMsg.textContent = `${reason} ${msgs.m} ${extra}`;

    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      fineTxt.textContent = "🔥 NUEVO RÉCORD. Ahora sí: compartilo.";
    } else {
      fineTxt.textContent = "Tip: grabá tu reacción. Rage = views.";
    }

    endScore.textContent = String(score);
    endBest.textContent = String(best);

    // efectos de perder
    playDeath(0.95);
    shake();
    flashBlackout(120);
    vib([80, 40, 120, 40, 160]);

    updateStats();
    setOverlay(true);
  }

  function winTap() {
    score += 1;
    updateStats();

    const cfg = getPhaseConfig();
    setRunningTaunt(cfg);
    updateDangerUI(cfg);

    // resetea tiempo en cada tap
    timeLimitMs = cfg.timeLimit;
    timeLeftMs = timeLimitMs;
    updateTimeBar();

    // micro feedback
    vib([12]);

    // salto brusco al cambiar fase (viral)
    if ([4, 8, 12, 16].includes(score)) {
      applyPhaseTimers();
      arena.style.filter = "brightness(1.05)";
      setTimeout(() => (arena.style.filter = ""), 90);
      if (cfg.fase >= 3) flashBlackout(95);
      if (cfg.fase >= 4) { shake(); vib([25, 30, 25]); }
    }

    afterTapTrick(cfg);

    // rojo se acerca más en fases altas
    if (cfg.fase >= 3) {
      const roll = (rngDaily() * 0.5) + (Math.random() * 0.5);
      if (roll < 0.36) repositionRed(cfg, "tap");
    }

    triggerFakeReds(cfg);
    maybeBlackout(cfg);
  }

  function resetRoundUI() {
    score = 0;
    updateStats();
    hint.textContent = "Tocá cualquier botón… pero NO el rojo.";
    mini.textContent = "Si tardás en tocar, perdés. (Sí, en serio.)";
    updateDangerUI(getPhaseConfig());
    timeFill.style.width = "100%";
    setOverlay(false);
  }

  function start() {
    // botón Jugar = interacción => desbloquea audio legalmente
    ensureAudio();

    resetRoundUI();
    playing = true;

    moveAllTiles(getPhaseConfig());
    repositionRed(getPhaseConfig(), "init");
    applyPhaseTimers();
  }

  // ===== Build tiles =====
  function clearTiles() {
    arena.innerHTML = "";
    tiles = [];
  }

  function buildTiles() {
    clearTiles();

    for (let i = 0; i < TILE_COUNT; i++) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "tile safe";
      el.setAttribute("aria-label", "botón");

      const dot = document.createElement("div");
      dot.className = "dot";
      el.appendChild(dot);

      const t = { el, x: 0, y: 0 };
      tiles.push(t);

      el.addEventListener("click", (ev) => {
        if (!playing) return;

        // si el usuario toca, ya podemos asegurar audio (por si apagó/encendió)
        ensureAudio();

        lastTap = { x: ev.clientX, y: ev.clientY, t: now() };

        if (tiles[redIndex].el === el) {
          lose("Tocaste el rojo.");
          return;
        }

        // falso rojo NO mata
        winTap();
      });

      arena.appendChild(el);
    }

    // rojo inicial determinista por día
    redIndex = randi(0, tiles.length - 1, rngDaily());
    tiles[redIndex].el.classList.remove("safe");
    tiles[redIndex].el.classList.add("red");

    moveAllTiles(getPhaseConfig());
  }

  // ===== Pointer tracking =====
  function onPointerMove(ev) {
    if (!playing) return;
    lastPointer = { x: ev.clientX, y: ev.clientY, t: now() };
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  // ===== Share =====
  async function shareScore() {
    const texto =
      `NO TOQUES EL ROJO 😭 (RETO DIARIO ${seedStr})\n` +
      `Aguanté ${score} toques.\n` +
      `¿Podés superarme?\n`;

    const url = location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title: "NO TOQUES EL ROJO", text: texto, url });
      } else {
        await navigator.clipboard.writeText(`${texto}${url}`);
        endMsg.textContent = "Copiado al portapapeles ✅ Mandalo al grupo.";
      }
    } catch { /* cancelado */ }
  }

  // ===== Buttons =====
  playBtn.addEventListener("click", () => start());
  shareBtn.addEventListener("click", () => shareScore());

  resetBtn.addEventListener("click", () => {
    localStorage.removeItem(BEST_KEY);
    best = 0;
    updateStats();
    hint.textContent = "Récord reiniciado. Ahora demostralo 😈";
    vib([20, 20, 20]);
  });

  // Tap afuera del card = restart instantáneo
  overlay.addEventListener("click", (e) => {
    if (e.target.closest(".card")) return;
    start();
  });

  // Resize
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (!tiles.length) return;
      moveAllTiles(getPhaseConfig());
      repositionRed(getPhaseConfig(), "resize");
    }, 140);
  });

  // ===== Boot =====
  function boot() {
    bestEl.textContent = String(best);
    buildTiles();

    playing = false;
    score = 0;
    updateStats();

    setOverlay(true);
    endTitle.textContent = "¿LISTO?";
    endMsg.textContent = "Tocá “Jugar”. No toqués el rojo. Si tardás… perdés.";
    endScore.textContent = "0";
    endBest.textContent = String(best);
    fineTxt.textContent = "Tip: grabá 3 intentos seguidos. Uno va a ser rage puro 😭";
    updateDangerUI(getPhaseConfig());
    timeFill.style.width = "100%";
  }

  boot();
})();
