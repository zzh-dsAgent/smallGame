(function () {
  const S = globalThis.DockSokoban;
  const LEVELS = S.LEVELS;
  const DIR_LABEL = { up: "上", down: "下", left: "左", right: "右" };
  const KEYS = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    a: "left",
    s: "down",
    d: "right",
    W: "up",
    A: "left",
    S: "down",
    D: "right",
  };
  const STORE_KEY = "dock-sokoban-v1";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.getElementById("board");
  const wrap = document.querySelector(".board-wrap");
  const renderer = S.createRenderer(canvas);
  const saved = loadStore();
  const audio = S.createAudio(saved.muted);

  const els = {
    kicker: document.getElementById("level-kicker"),
    name: document.getElementById("level-name"),
    moves: document.getElementById("moves"),
    pushes: document.getElementById("pushes"),
    par: document.getElementById("par"),
    best: document.getElementById("best"),
    tip: document.getElementById("tip"),
    toast: document.getElementById("toast"),
    banner: document.getElementById("banner"),
    bannerKicker: document.getElementById("banner-kicker"),
    bannerTitle: document.getElementById("banner-title"),
    bannerStats: document.getElementById("banner-stats"),
    bannerNext: document.getElementById("banner-next"),
    undo: document.getElementById("undo"),
    restart: document.getElementById("restart"),
    hint: document.getElementById("hint"),
    sound: document.getElementById("sound"),
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    levels: document.getElementById("levels"),
    pad: document.getElementById("pad"),
  };

  let index = clamp(saved.level || 0, 0, LEVELS.length - 1);
  let cleared = saved.cleared || {};
  let best = saved.best || {};
  let state = null;
  let history = [];
  let inputQueue = [];
  let active = null;
  let moveCount = 0;
  let pushCount = 0;
  let won = false;
  let winNoted = false;
  let hover = null;
  let hintMark = null;
  let shakeUntil = 0;
  let particles = [];
  let toastToken = 0;
  let cellSize = 48;

  buildLevelButtons();
  startLevel();
  syncSoundButton();
  window.requestAnimationFrame(frame);

  els.undo.addEventListener("click", undo);
  els.restart.addEventListener("click", restart);
  els.hint.addEventListener("click", showHint);
  els.sound.addEventListener("click", () => {
    audio.toggle();
    syncSoundButton();
    persist();
    if (!audio.muted) audio.step();
  });
  els.prev.addEventListener("click", () => goto(index - 1));
  els.next.addEventListener("click", () => goto(index + 1));
  els.bannerNext.addEventListener("click", () => {
    if (index >= LEVELS.length - 1) goto(0);
    else goto(index + 1);
  });
  els.pad.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dir]");
    if (!button) return;
    enqueueDir(button.dataset.dir);
  });

  window.addEventListener("keydown", (event) => {
    const dir = KEYS[event.key];
    if (dir) {
      event.preventDefault();
      setHeld(dir, true);
      enqueueDir(dir);
      return;
    }
    if (event.key === "z" || event.key === "Z" || event.key === "Backspace" || event.key === "Escape") {
      event.preventDefault();
      undo();
    } else if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      restart();
    } else if (event.key === "h" || event.key === "H") {
      event.preventDefault();
      showHint();
    } else if (event.key === "[") {
      goto(index - 1);
    } else if (event.key === "]") {
      goto(index + 1);
    }
  });
  window.addEventListener("keyup", (event) => {
    const dir = KEYS[event.key];
    if (dir) setHeld(dir, false);
  });
  window.addEventListener("blur", () => {
    document.querySelectorAll("[data-dir]").forEach((button) => button.classList.remove("is-held"));
  });

  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.px = String(event.clientX);
    canvas.dataset.py = String(event.clientY);
    canvas.dataset.pid = String(event.pointerId);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (canvas.dataset.pid !== String(event.pointerId)) return;
    const dx = event.clientX - Number(canvas.dataset.px);
    const dy = event.clientY - Number(canvas.dataset.py);
    if (Math.hypot(dx, dy) >= 28) {
      if (Math.abs(dx) > Math.abs(dy)) enqueueDir(dx > 0 ? "right" : "left");
      else enqueueDir(dy > 0 ? "down" : "up");
      return;
    }
    const cell = cellFromEvent(event);
    if (!cell) return;
    const plan = S.planClick(state, cell.x, cell.y);
    if (plan && plan.length) enqueuePlan(plan);
  });
  canvas.addEventListener("pointermove", (event) => {
    hover = cellFromEvent(event);
  });
  canvas.addEventListener("pointerleave", () => {
    hover = null;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);
  else window.addEventListener("resize", fit);

  function startLevel() {
    state = S.loadLevel(LEVELS[index]);
    history = [];
    inputQueue = [];
    active = null;
    moveCount = 0;
    pushCount = 0;
    won = false;
    winNoted = false;
    hintMark = null;
    particles = [];
    hover = null;
    hideBanner();
    renderHud();
    fit();
    persist();
  }

  function restart() {
    startLevel();
  }

  function goto(nextIndex) {
    if (nextIndex < 0 || nextIndex >= LEVELS.length || nextIndex === index) return;
    index = nextIndex;
    startLevel();
  }

  function enqueueDir(dir) {
    if (won) return;
    if (inputQueue.length >= 2) return;
    hintMark = null;
    inputQueue.push(dir);
    pump();
  }

  function enqueuePlan(dirs) {
    if (won || active || inputQueue.length) return;
    hintMark = null;
    inputQueue.push.apply(inputQueue, dirs);
    pump();
  }

  function pump() {
    if (active) return;
    while (inputQueue.length) {
      const dir = inputQueue.shift();
      const result = S.tryMove(state, dir);
      if (!result.ok) {
        if (!inputQueue.length) {
          shake();
          audio.blocked();
        }
        continue;
      }
      history.push({ state, moveCount, pushCount });
      const from = state;
      state = result.state;
      moveCount += 1;
      if (result.pushed) pushCount += 1;
      active = {
        from,
        to: state,
        dir,
        pushed: result.pushed,
        dur: duration(result.pushed),
        started: null,
      };
      if (result.pushed) audio.push();
      else if (!inputQueue.length) audio.step();
      if (S.isWin(state)) {
        won = true;
        inputQueue.length = 0;
      }
      renderHud();
      return;
    }
  }

  function undo() {
    inputQueue.length = 0;
    active = null;
    hintMark = null;
    if (!history.length) return;
    const prev = history.pop();
    state = prev.state;
    moveCount = prev.moveCount;
    pushCount = prev.pushCount;
    won = false;
    winNoted = false;
    particles = [];
    hideBanner();
    renderHud();
  }

  function showHint() {
    if (won || active || inputQueue.length) return;
    const result = S.solve(state, { maxMs: 250, maxStates: 200000 });
    if (result.status === "solved" && result.path.length) {
      const dir = result.path[0];
      hintMark = { dir, until: performance.now() + 1700 };
      setHeld(dir, true);
      window.setTimeout(() => setHeld(dir, false), 650);
      toast("下一步：向" + DIR_LABEL[dir]);
      return;
    }
    if (result.status === "stuck") toast("这个局面推死了，撤销几步再试");
    else toast("这一步变化太多，提示没算完");
  }

  function frame(now) {
    advance(now);
    if (won && !active && !winNoted) celebrate();
    particles = particles
      .map((particle) => ({
        x: particle.x + particle.vx,
        y: particle.y + particle.vy,
        vx: particle.vx * 0.98,
        vy: particle.vy + 0.004,
        life: particle.life - 0.018,
        color: particle.color,
      }))
      .filter((particle) => particle.life > 0);

    const pose = currentPose();
    renderer.draw({
      width: state.width,
      height: state.height,
      walls: state.walls,
      goals: state.goals,
      player: { x: pose.player.x, y: pose.player.y, facing: pose.facing },
      boxes: pose.boxes,
      cell: cellSize,
      time: now,
      stride: pose.stride,
      pushing: pose.pushing,
      hint: hintMark && now < hintMark.until ? hintMark.dir : null,
      hover: won ? null : hover,
      shake: now < shakeUntil ? Math.sin((shakeUntil - now) * 0.08) * 3 : 0,
      particles,
    });
    window.requestAnimationFrame(frame);
  }

  function advance(now) {
    while (active) {
      if (active.started == null) active.started = now;
      if (now - active.started < active.dur) return;
      const overflow = now - (active.started + active.dur);
      active = null;
      if (!won) pump();
      if (active && active.started == null) active.started = now - overflow;
    }
  }

  function currentPose() {
    if (!active) {
      return { player: state.player, boxes: state.boxes, facing: state.facing, stride: 0, pushing: false };
    }
    const t = active.dur === 0 ? 1 : Math.min(1, (performance.now() - active.started) / active.dur);
    const eased = t * t * (3 - 2 * t);
    return {
      player: lerp(active.from.player, active.to.player, eased),
      boxes: active.from.boxes.map((box, i) => lerp(box, active.to.boxes[i], eased)),
      facing: active.dir,
      stride: eased,
      pushing: active.pushed,
    };
  }

  function celebrate() {
    winNoted = true;
    const previous = best[index];
    const better = !previous || moveCount < previous.moves || (moveCount === previous.moves && pushCount < previous.pushes);
    if (better) best[index] = { moves: moveCount, pushes: pushCount };
    cleared[index] = true;
    particles = spawnParticles(state);
    audio.win();
    showBanner(previous, better);
    renderHud();
    persist();
  }

  function showBanner(previous, better) {
    const last = index >= LEVELS.length - 1;
    els.bannerKicker.textContent = last ? "夜班结束" : "本关完成";
    els.bannerTitle.textContent = last ? "整座仓库都归位了" : "箱子都归位了";
    const level = LEVELS[index];
    let text = "走了 " + moveCount + " 步，推了 " + pushCount + " 次。";
    if (level.par) {
      const diff = moveCount - level.par;
      if (diff === 0) text += "刚好是参考步数。";
      else if (diff > 0) text += "比参考多 " + diff + " 步。";
      else text += "比参考少 " + -diff + " 步。";
    }
    if (better) text += "刷新了最好成绩。";
    else if (previous) text += "最好成绩还是 " + previous.moves + " 步。";
    els.bannerStats.textContent = text;
    els.bannerNext.textContent = last ? "回到第一关" : "下一关";
    els.banner.hidden = false;
    els.bannerNext.focus();
  }

  function hideBanner() {
    els.banner.hidden = true;
  }

  function renderHud() {
    const level = LEVELS[index];
    els.kicker.textContent = "第 " + (index + 1) + " / " + LEVELS.length + " 关";
    els.name.textContent = level.name;
    els.moves.textContent = String(moveCount);
    els.pushes.textContent = String(pushCount);
    els.par.textContent = level.par ? String(level.par) : "—";
    els.best.textContent = best[index] ? String(best[index].moves) : "—";
    els.tip.textContent = level.tip || "";
    els.undo.disabled = history.length === 0;
    els.prev.disabled = index === 0;
    els.next.disabled = index === LEVELS.length - 1;
    document.title = level.name + " · 推箱子";
    refreshLevelButtons();
  }

  function buildLevelButtons() {
    LEVELS.forEach((level, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "level-btn";
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = String(i + 1);
      button.append(num, document.createTextNode(level.name));
      button.addEventListener("click", () => goto(i));
      els.levels.appendChild(button);
    });
  }

  function refreshLevelButtons() {
    Array.from(els.levels.children).forEach((button, i) => {
      button.classList.toggle("is-current", i === index);
      button.classList.toggle("is-done", !!cleared[i]);
      button.setAttribute("aria-current", i === index ? "true" : "false");
    });
  }

  function fit() {
    const narrow = window.innerWidth < 720;
    const maxW = Math.max(160, Math.min(wrap.clientWidth, window.innerWidth - 56));
    const maxH = Math.max(180, Math.min(window.innerHeight * (narrow ? 0.46 : 0.58), 640));
    const size = Math.floor(Math.min(maxW / state.width, maxH / state.height));
    cellSize = Math.max(22, Math.min(size, 76));
    if (cellSize * state.width > maxW) cellSize = Math.max(8, Math.floor(maxW / state.width));
    renderer.setSize(cellSize * state.width, cellSize * state.height);
  }

  function cellFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * state.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * state.height);
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
    return { x, y };
  }

  function spawnParticles(source) {
    const list = [];
    const colors = ["#f4ecdf", "#e0b15d", "#e4572e"];
    source.boxes.forEach((box) => {
      for (let i = 0; i < 7; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.03 + Math.random() * 0.05;
        list.push({
          x: box.x + 0.5,
          y: box.y + 0.5,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.02,
          life: 1,
          color: colors[i % colors.length],
        });
      }
    });
    return list;
  }

  function toast(text) {
    const token = ++toastToken;
    els.toast.textContent = text;
    window.setTimeout(() => {
      if (toastToken === token) els.toast.textContent = "";
    }, 1800);
  }

  function shake() {
    shakeUntil = performance.now() + 160;
  }

  function duration(pushed) {
    if (reduceMotion) return 0;
    return pushed ? 130 : 90;
  }

  function setHeld(dir, on) {
    document.querySelectorAll('[data-dir="' + dir + '"]').forEach((button) => {
      button.classList.toggle("is-held", on);
    });
  }

  function syncSoundButton() {
    els.sound.textContent = audio.muted ? "声音关" : "声音开";
    els.sound.setAttribute("aria-pressed", audio.muted ? "false" : "true");
  }

  function persist() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ level: index, cleared, best, muted: audio.muted })
      );
    } catch (err) {
      /* 隐私模式里写不进本地记录，游戏本身继续。 */
    }
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch (err) {
      return {};
    }
  }

  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
