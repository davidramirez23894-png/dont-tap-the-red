// game.js
(() => {
  const arena = document.getElementById("arena");
  const overlay = document.getElementById("overlay");

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

  // ===== Config base =====
  const TILE_COUNT = 20;
  const EDGE_PAD = 10;

  const BEST_KEY = "nter_best_v2";

  // Estado
  let tiles = [];
  let redIndex = 0;
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);

  let moveTimer = null;
  let redTimer = null;
  let microTimer = null;

  let playing = false;

  // Tracking de dedo (para “cazar”)
  let lastPointer = { x: null, y: null, t: 0 };
  let lastTap = { x: null, y: null, t: 0 };

  // ===== Helpers =====
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const now = () => performance.now();

  function setOverlay(show) {
    overlay.classList.toggle("show", show);
  }

  function updateStats() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
  }

  function arenaRect() {
    return arena.getBoundingClientRect();
  }

  function getTileSize() {
    const probe = tiles[0]?.el;
    if (!probe) return { w: 88, h: 64 };
    const r = probe.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function randomPosition() {
    const rect = arenaRect();
    const { w, h } = getTileSize();
    const maxX = Math.max(0, rect.width - w - EDGE_PAD);
    const maxY = Math.max(0, rect.height - h - EDGE_PAD);
    return { x: randi(EDGE_PAD, maxX), y: randi(EDGE_PAD, maxY) };
  }

  // el rojo “cerca” del dedo, pero no demasiado obvio
  function nearPointerPosition(px, py, safeRadius, huntRadius) {
    const rect = arenaRect();
    const { w, h } = getTileSize();

    const localX = px - rect.left - w / 2;
    const localY = py - rect.top - h / 2;

    const angle = rand(0, Math.PI * 2);
    const radius = rand(safeRadius, huntRadius);

    let x = localX + Math.cos(angle) * radius;
    let y = localY + Math.sin(angle) * radius;

    const maxX = Math.max(0, rect.width - w - EDGE_PAD);
    const maxY = Math.max(0, rect.height - h - EDGE_PAD);

    x = clamp(x, EDGE_PAD, maxX);
    y = clamp(y, EDGE_PAD, maxY);

    return { x: Math.round(x), y: Math.round(y) };
  }

  function placeTile(i, x, y) {
    const t = tiles[i];
    t.x = x; t.y = y;
    t.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  // evita que queden súper apilados
  function moveAllTiles() {
    const used = [];
    const rect = arenaRect();
    const { w, h } = getTileSize();

    function ok(x, y) {
      for (const p of used) {
        if (Math.abs(p.x - x) < w * 0.68 && Math.abs(p.y - y) < h * 0.68) return false;
      }
      return true;
    }

    for (let i = 0; i < tiles.length; i++) {
      let tries = 0;
      let p = randomPosition();
      while (!ok(p.x, p.y) && tries < 40) {
        p = randomPosition();
        tries++;
      }
      used.push(p);
      placeTile(i, p.x, p.y);
    }
  }

  // ===== Dificultad por fases (viral) =====
  function getPhaseConfig() {
    // Fases invisibles: sube la maldad sin avisar
    // score: 0-3 / 4-7 / 8-11 / 12-15 / 16+
    const s = score;

    if (s <= 3) {
      return {
        fase: 1,
        modo: "Calentamiento",
        moveTick: 980,
        redTick: 760,
        microTick: 0,
        cheatChance: 0.38,
        safeRadius: 95,
        huntRadius: 150,
        nearMissChance: 0.20
      };
    }
    if (s <= 7) {
      return {
        fase: 2,
        modo: "Se pone raro",
        moveTick: 900,
        redTick: 680,
        microTick: 0,
        cheatChance: 0.56,
        safeRadius: 90,
        huntRadius: 155,
        nearMissChance: 0.28
      };
    }
    if (s <= 11) {
      return {
        fase: 3,
        modo: "Cazador activo",
        moveTick: 820,
        redTick: 610,
        microTick: 0,
        cheatChance: 0.68,
        safeRadius: 86,
        huntRadius: 160,
        nearMissChance: 0.36
      };
    }
    if (s <= 15) {
      return {
        fase: 4,
        modo: "Caos real",
        moveTick: 760,
        redTick: 560,
        microTick: 720, // micro-movimientos extra del rojo
        cheatChance: 0.78,
        safeRadius: 82,
        huntRadius: 168,
        nearMissChance: 0.46
      };
    }
    return {
      fase: 5,
      modo: "Imposible (casi)",
      moveTick: 720,
      redTick: 520,
      microTick: 620,
      cheatChance: 0.86,
      safeRadius: 78,
      huntRadius: 178,
      nearMissChance: 0.58
    };
  }

  function updateDangerUI(cfg) {
    faseTxt.textContent = `Fase: ${cfg.fase}`;
    modoTxt.textContent = `Modo: ${cfg.modo}`;
    const pct = clamp((cfg.fase - 1) / 4 * 100, 0, 100);
    dangerFill.style.width = `${pct}%`;
  }

  // ===== Mensajes virales (pican) =====
  function setRunningTaunt(cfg) {
    const s = score;
    if (s === 0) {
      hint.textContent = "Tocá cualquier botón… pero NO el rojo.";
      mini.textContent = "Ojo: el rojo se mueve donde vos vas.";
      return;
    }

    if (s === 3) hint.textContent = "Ok… ya entendiste. Ahora viene lo feo.";
    if (s === 6) hint.textContent = "Acá muere todo el mundo.";
    if (s === 9) hint.textContent = "Si perdés ahora… duele.";
    if (s === 12) hint.textContent = "Grabalo. Nadie te va a creer.";
    if (s === 15) hint.textContent = "¿Cómo seguís vivo?";
    if (s >= 16) hint.textContent = "Esto ya es ilegal 😭";
  }

  function endMessages(s) {
    if (s <= 1) return { t: "OUCH", m: "Duraste menos que un parpadeo." };
    if (s <= 3) return { t: "CASI", m: "Ok… una más. No te vas a ir así." };
    if (s <= 6) return { t: "TODO EL MUNDO CAE AQUÍ", m: "Es normal… (no es normal)." };
    if (s <= 9) return { t: "DUELE", m: "Estuviste demasiado cerca." };
    if (s <= 12) return { t: "NO TE CREO", m: "Eso ya fue nivel TikTok." };
    if (s <= 16) return { t: "¿LEYENDA?", m: "Compartilo YA. En serio." };
    return { t: "HACKER", m: "Ok… esto es ridículo. Compartilo." };
  }

  // ===== Rojo tramposo + near-miss =====
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

    // Decide si “caza”
    const shouldHunt = recentPointer && Math.random() < cfg.cheatChance;

    if (!shouldHunt) {
      const p = randomPosition();
      placeTile(redIndex, p.x, p.y);
      return;
    }

    // 1) Cerca del dedo (no exacto)
    let p = nearPointerPosition(pX, pY, cfg.safeRadius, cfg.huntRadius);

    // 2) Si acabás de tocar, mezcla con la zona del toque (más maldad)
    if (recentTap) {
      const p2 = nearPointerPosition(lastTap.x, lastTap.y, cfg.safeRadius, cfg.huntRadius);
      p.x = Math.round(p.x * 0.55 + p2.x * 0.45);
      p.y = Math.round(p.y * 0.55 + p2.y * 0.45);
    }

    placeTile(redIndex, p.x, p.y);

    // Near-miss: a veces parpadea para “asustar” (viral)
    if (reason !== "init" && (recentTap || recentPointer) && Math.random() < cfg.nearMissChance) {
      redTile.el.classList.add("nearMiss");
      setTimeout(() => redTile.el.classList.remove("nearMiss"), 420);
    }
  }

  function chooseNextRedIndex() {
    let idx = randi(0, tiles.length - 1);
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

  // Efecto “me reaccionó” después del toque (pero sutil)
  function afterTapTrick(cfg) {
    if (!playing) return;

    // En fases altas, a veces el rojo “teletransporta” justo después
    if (cfg.fase >= 3 && Math.random() < 0.22) {
      setTimeout(() => repositionRed(cfg, "afterTap"), randi(55, 110));
    }
    // En fases altas, a veces cambia el rojo de golpe
    if (cfg.fase >= 4 && Math.random() < 0.18) {
      setTimeout(() => swapRed(cfg), randi(90, 160));
    }
  }

  // ===== Loop timers según fase =====
  function clearTimers() {
    if (moveTimer) clearInterval(moveTimer);
    if (redTimer) clearInterval(redTimer);
    if (microTimer) clearInterval(microTimer);
    moveTimer = redTimer = microTimer = null;
  }

  function applyPhaseTimers() {
    const cfg = getPhaseConfig();
    updateDangerUI(cfg);

    clearTimers();

    // Movimiento general
    moveTimer = setInterval(() => {
      moveAllTiles();
      repositionRed(cfg, "moveAll");
    }, cfg.moveTick);

    // Swap de rojo
    redTimer = setInterval(() => {
      swapRed(cfg);
    }, cfg.redTick);

    // Micro movimientos extra del rojo (solo fases 4+)
    if (cfg.microTick > 0) {
      microTimer = setInterval(() => {
        repositionRed(cfg, "micro");
      }, cfg.microTick);
    }
  }

  // ===== Game Flow =====
  function lose(reason = "Tocaste el rojo.") {
    playing = false;
    clearTimers();

    const msgs = endMessages(score);
    endTitle.textContent = msgs.t;

    // “humillación amigable” + cercanía
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
      fineTxt.textContent = "Tip: grabá tu reacción. Eso se vuelve viral.";
    }

    endScore.textContent = String(score);
    endBest.textContent = String(best);

    updateStats();
    setOverlay(true);
  }

  function winTap() {
    score += 1;
    updateStats();

    const cfg = getPhaseConfig();
    setRunningTaunt(cfg);

    // Si cambiás de fase, recalibrá timers (sube dificultad al toque)
    updateDangerUI(cfg);

    // Re-aplicar timers justo al cruzar umbrales
    // (para que el salto se sienta “de repente”)
    if ([4, 8, 12, 16].includes(score)) {
      applyPhaseTimers();
      // micro golpe visual
      arena.style.filter = "brightness(1.04)";
      setTimeout(() => (arena.style.filter = ""), 90);
    }

    afterTapTrick(cfg);
  }

  function resetRoundUI() {
    score = 0;
    updateStats();
    hint.textContent = "Tocá cualquier botón… pero NO el rojo.";
    mini.textContent = "Consejo: el rojo se acerca a tu dedo 😈";
    updateDangerUI(getPhaseConfig());
    setOverlay(false);
  }

  function start() {
    resetRoundUI();
    playing = true;

    moveAllTiles();

    // reposiciona rojo con cfg inicial (no muy malvado)
    repositionRed(getPhaseConfig(), "init");

    // arranca timers según fase
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

        lastTap = { x: ev.clientX, y: ev.clientY, t: now() };

        // Si tocó el rojo: perder
        if (tiles[redIndex].el === el) {
          lose("Tocaste el rojo.");
          return;
        }

        // Si tocó seguro: sumar
        winTap();

        // En fases altas, a veces el rojo “te cae encima” (pero no siempre)
        const cfg = getPhaseConfig();
        if (cfg.fase >= 3 && Math.random() < 0.30) repositionRed(cfg, "tap");
      });

      arena.appendChild(el);
    }

    // rojo inicial
    redIndex = randi(0, tiles.length - 1);
    tiles[redIndex].el.classList.remove("safe");
    tiles[redIndex].el.classList.add("red");

    moveAllTiles();
  }

  // ===== Pointer tracking (para cazar) =====
  function onPointerMove(ev) {
    if (!playing) return;
    lastPointer = { x: ev.clientX, y: ev.clientY, t: now() };
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  // ===== Share (viral) =====
  async function shareScore() {
    const texto =
      `NO TOQUES EL ROJO 😭\n` +
      `Aguanté ${score} toques.\n` +
      `¿Podés superarme?\n`;

    const url = location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "NO TOQUES EL ROJO",
          text: texto,
          url
        });
      } else {
        await navigator.clipboard.writeText(`${texto}${url}`);
        endMsg.textContent = "Copiado al portapapeles ✅ Mandalo al grupo.";
      }
    } catch {
      // cancelado o bloqueado
    }
  }

  // ===== Buttons =====
  playBtn.addEventListener("click", () => start());
  shareBtn.addEventListener("click", () => shareScore());

  resetBtn.addEventListener("click", () => {
    localStorage.removeItem(BEST_KEY);
    best = 0;
    updateStats();
    hint.textContent = "Récord reiniciado. Ahora demostralo 😈";
  });

  // Tap afuera del card = restart instantáneo (loop TikTok)
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
      moveAllTiles();
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
    endMsg.textContent = "Tocá “Jugar”. No toqués el rojo. Y grabá tu reacción 😭";
    endScore.textContent = "0";
    endBest.textContent = String(best);
    fineTxt.textContent = "Tip: videos cortos y rage = viral.";
    updateDangerUI(getPhaseConfig());
  }

  boot();
})();
