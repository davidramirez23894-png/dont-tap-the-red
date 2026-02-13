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

  const playBtn = document.getElementById("playBtn");
  const shareBtn = document.getElementById("shareBtn");
  const resetBtn = document.getElementById("resetBtn");

  const hint = document.getElementById("hint");
  const mini = document.getElementById("mini");

  // ===== Config (tuned for “viral feel”) =====
  const TILE_COUNT = 18;                // number of tiles
  const MOVE_TICK_MS = 900;             // movement tempo (feels chaotic)
  const RED_TICK_MS = 650;              // red swaps faster than movement
  const CHEAT_CHANCE = 0.62;            // how often red “hunts” your finger
  const CHEAT_RADIUS = 135;             // how near it tries to appear (px)
  const SAFE_RADIUS = 86;               // minimum distance to avoid “too obvious”
  const EDGE_PAD = 10;

  const BEST_KEY = "dtr_best_v1";

  // ===== State =====
  let tiles = [];
  let redIndex = 0;
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);

  let moveTimer = null;
  let redTimer = null;
  let playing = false;

  // last pointer info (to “cheat” subtly)
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

  function setText(el, txt) {
    el.textContent = String(txt);
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return Math.hypot(dx, dy);
  }

  function arenaRect() {
    return arena.getBoundingClientRect();
  }

  function updateStats() {
    setText(scoreEl, score);
    setText(bestEl, best);
  }

  function setHintRunning() {
    const taunts = [
      "Tap any tile… just not the red.",
      "Trust your finger… or don’t 😭",
      "The red tile moves. A lot.",
      "You’re one tap away. Probably.",
      "This is fair. Totally. (No.)"
    ];
    hint.textContent = taunts[randi(0, taunts.length - 1)];
    mini.textContent = "Record your reaction. People won’t believe you.";
  }

  function endMessages(s) {
    if (s <= 2) return { title: "OUCH", msg: "That was fast. Again." };
    if (s <= 6) return { title: "ALMOST", msg: "You were warming up…" };
    if (s <= 10) return { title: "SO CLOSE", msg: "One more run. You got this." };
    if (s <= 16) return { title: "NO WAY", msg: "That was actually insane." };
    return { title: "LEGEND?", msg: "Ok… people need to see this." };
  }

  // ===== Layout / positioning =====
  function placeTile(i, x, y) {
    const t = tiles[i];
    t.x = x;
    t.y = y;
    t.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  function getTileSize() {
    // Read computed sizes (responsive)
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
    return {
      x: randi(EDGE_PAD, maxX),
      y: randi(EDGE_PAD, maxY)
    };
  }

  function nudgePositionNear(px, py) {
    const rect = arenaRect();
    const { w, h } = getTileSize();

    // Convert pointer (client) to arena local
    const localX = px - rect.left - w / 2;
    const localY = py - rect.top - h / 2;

    // Pick a point in a ring around finger (not exactly on it)
    const angle = rand(0, Math.PI * 2);
    const radius = rand(SAFE_RADIUS, CHEAT_RADIUS);
    let x = localX + Math.cos(angle) * radius;
    let y = localY + Math.sin(angle) * radius;

    const maxX = Math.max(0, rect.width - w - EDGE_PAD);
    const maxY = Math.max(0, rect.height - h - EDGE_PAD);

    x = clamp(x, EDGE_PAD, maxX);
    y = clamp(y, EDGE_PAD, maxY);

    return { x: Math.round(x), y: Math.round(y) };
  }

  function moveAllTilesChaos() {
    // move all tiles to new random positions (but avoid perfect overlaps)
    const used = [];
    const rect = arenaRect();
    const { w, h } = getTileSize();

    function ok(x, y) {
      // simple spacing check
      for (const p of used) {
        if (Math.abs(p.x - x) < w * 0.7 && Math.abs(p.y - y) < h * 0.7) return false;
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

    // tiny “camera shake” feel (subtle)
    arena.style.filter = "brightness(1.02)";
    setTimeout(() => (arena.style.filter = ""), 80);
  }

  // ===== Red “cheat” logic =====
  function chooseNextRedIndex() {
    // pick any safe tile (not current red)
    let idx = randi(0, tiles.length - 1);
    if (idx === redIndex) idx = (idx + 1) % tiles.length;
    return idx;
  }

  function repositionRedCheeky() {
    if (!playing) return;

    const rect = arenaRect();
    if (!rect.width || !rect.height) return;

    const t = tiles[redIndex];
    if (!t) return;

    const pX = lastPointer.x;
    const pY = lastPointer.y;

    const shouldCheat =
      pX !== null &&
      pY !== null &&
      (now() - lastPointer.t) < 900 &&
      Math.random() < CHEAT_CHANCE;

    if (!shouldCheat) {
      // normal move
      const p = randomPosition();
      placeTile(redIndex, p.x, p.y);
      return;
    }

    // cheat: move red near finger, but not too perfectly
    const p = nudgePositionNear(pX, pY);

    // if last tap exists, bias slightly closer after a tap to feel “mean”
    if (lastTap.x !== null && (now() - lastTap.t) < 800) {
      const p2 = nudgePositionNear(lastTap.x, lastTap.y);
      // blend positions a bit
      p.x = Math.round(p.x * 0.55 + p2.x * 0.45);
      p.y = Math.round(p.y * 0.55 + p2.y * 0.45);
    }

    placeTile(redIndex, p.x, p.y);
  }

  function swapRed() {
    if (!playing) return;

    // remove old red class
    tiles[redIndex].el.classList.remove("red");
    tiles[redIndex].el.classList.add("safe");

    redIndex = chooseNextRedIndex();

    tiles[redIndex].el.classList.remove("safe");
    tiles[redIndex].el.classList.add("red");

    // after swap, reposition red (sometimes cheeky)
    repositionRedCheeky();
  }

  // ===== Game flow =====
  function lose(reason = "You tapped the red. 💀") {
    playing = false;
    clearInterval(moveTimer);
    clearInterval(redTimer);

    const msgs = endMessages(score);
    endTitle.textContent = msgs.title;
    endMsg.textContent = `${reason} ${msgs.msg}`;

    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }

    endScore.textContent = String(score);
    endBest.textContent = String(best);

    updateStats();
    setOverlay(true);
  }

  function winTap() {
    score += 1;
    updateStats();

    // micro taunts that boost “one more”
    if (score === 1) hint.textContent = "Ok… not bad.";
    if (score === 4) hint.textContent = "Now it gets weird.";
    if (score === 7) hint.textContent = "It’s watching your finger 👀";
    if (score === 10) hint.textContent = "People won’t believe this.";
    if (score === 14) hint.textContent = "You’re actually cracked.";
  }

  function resetRoundUI() {
    score = 0;
    updateStats();
    setHintRunning();
    setOverlay(false);
  }

  function start() {
    resetRoundUI();
    playing = true;

    // kick chaos loops
    moveAllTilesChaos();
    repositionRedCheeky();

    moveTimer = setInterval(() => {
      moveAllTilesChaos();
      // after chaos, do a quick cheeky red adjust so it “follows” the finger
      repositionRedCheeky();
    }, MOVE_TICK_MS);

    redTimer = setInterval(() => {
      swapRed();
    }, RED_TICK_MS);
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
      el.setAttribute("aria-label", "tile");

      const dot = document.createElement("div");
      dot.className = "dot";
      el.appendChild(dot);

      const t = { el, x: 0, y: 0 };
      tiles.push(t);

      el.addEventListener("click", (ev) => {
        if (!playing) return;

        // capture tap location for “cheat” feel
        const e = ev;
        const rect = arenaRect();
        lastTap = {
          x: e.clientX,
          y: e.clientY,
          t: now()
        };

        if (tiles[redIndex].el === el) {
          lose("You tapped the red.");
          return;
        }

        winTap();

        // slight instant chaos after each successful tap (keeps adrenaline)
        if (score >= 2 && Math.random() < 0.35) {
          repositionRedCheeky();
        }
        if (score >= 5 && Math.random() < 0.22) {
          swapRed();
        }
      });

      arena.appendChild(el);
    }

    // pick initial red
    redIndex = randi(0, tiles.length - 1);
    tiles[redIndex].el.classList.remove("safe");
    tiles[redIndex].el.classList.add("red");

    // initial positions
    moveAllTilesChaos();
  }

  // ===== Pointer tracking (so red can “hunt”) =====
  function onPointerMove(ev) {
    // only track when playing (performance + fairness)
    if (!playing) return;
    lastPointer = { x: ev.clientX, y: ev.clientY, t: now() };
  }

  // touchmove passive helps scrolling; we don't scroll anyway in arena
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  // ===== Share =====
  async function shareScore() {
    const text = `DON’T TAP THE RED 😭\nI survived ${score} taps.\nCan you beat me?`;
    const url = location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title: "DON’T TAP THE RED", text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        endMsg.textContent = "Copied to clipboard ✅ Send it to your friends.";
      }
    } catch {
      // user cancelled or blocked
    }
  }

  // ===== Buttons =====
  playBtn.addEventListener("click", () => start());
  shareBtn.addEventListener("click", () => shareScore());

  resetBtn.addEventListener("click", () => {
    localStorage.removeItem(BEST_KEY);
    best = 0;
    updateStats();
    hint.textContent = "Best reset. Now prove yourself 😈";
  });

  // Tap overlay background to restart (fast loop)
  overlay.addEventListener("click", (e) => {
    // avoid double triggering when clicking buttons
    if (e.target.closest(".card")) return;
    start();
  });

  // Handle resize: rebuild positions (keeps tiles inside)
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (!tiles.length) return;
      moveAllTilesChaos();
      repositionRedCheeky();
    }, 140);
  });

  // ===== Boot =====
  function boot() {
    bestEl.textContent = String(best);
    buildTiles();
    // start with overlay (so user hits Play → better “first impression”)
    playing = false;
    score = 0;
    updateStats();
    setOverlay(true);
    endTitle.textContent = "READY?";
    endMsg.textContent = "Tap Play. Don’t tap the red. That’s it.";
    endScore.textContent = "0";
    endBest.textContent = String(best);
  }

  boot();
})();
