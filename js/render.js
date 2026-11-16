(function () {
  const S = (globalThis.DockSokoban = globalThis.DockSokoban || {});
  const DIRS = S.DIRS;
  const FLOORS = ["#6d5140", "#745743", "#654a39", "#7b5c46"];

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  S.createRenderer = function (canvas) {
    const ctx = canvas.getContext("2d");
    let dpr = 1;
    let viewW = 1;
    let viewH = 1;

    function setSize(cssW, cssH) {
      dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      viewW = cssW;
      viewH = cssH;
      const bufferW = Math.max(1, Math.round(cssW * dpr));
      const bufferH = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== bufferW || canvas.height !== bufferH) {
        canvas.width = bufferW;
        canvas.height = bufferH;
      }
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
    }

    function draw(snapshot) {
      const s = snapshot.cell;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);
      ctx.save();
      ctx.translate(snapshot.shake || 0, 0);

      for (let y = 0; y < snapshot.height; y++) {
        for (let x = 0; x < snapshot.width; x++) {
          const id = x + "," + y;
          if (snapshot.walls.has(id)) drawWall(ctx, x * s, y * s, s, x, y);
          else drawFloor(ctx, x * s, y * s, s, x, y);
          if (snapshot.goals.has(id)) drawGoal(ctx, x * s, y * s, s);
        }
      }

      snapshot.boxes.forEach((box) => {
        const onGoal = snapshot.goals.has(Math.round(box.x) + "," + Math.round(box.y));
        drawCrate(ctx, box.x * s, box.y * s, s, onGoal);
      });
      drawWorker(ctx, snapshot.player, s, snapshot.stride || 0, snapshot.pushing);
      if (snapshot.hint) drawHint(ctx, snapshot.player, snapshot.hint, s, snapshot.time);
      if (snapshot.hover) drawHover(ctx, snapshot.hover, s, snapshot.walls);
      snapshot.particles.forEach((particle) => drawParticle(ctx, particle, s));
      ctx.restore();
    }

    return { setSize, draw };
  };

  function drawFloor(ctx, x, y, s, gx, gy) {
    ctx.fillStyle = FLOORS[(gx * 3 + gy * 5) % FLOORS.length];
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = "rgba(42, 24, 14, 0.28)";
    ctx.lineWidth = 1;
    const grain = ((gx * 5 + gy * 2) % 3) + 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + (s * grain) / 4);
    ctx.lineTo(x + s - 2, y + (s * grain) / 4);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 236, 210, 0.04)";
    ctx.fillRect(x, y, s, 2);
  }

  function drawWall(ctx, x, y, s) {
    ctx.fillStyle = "#1a4e4b";
    ctx.fillRect(x - 0.5, y - 0.5, s + 1, s + 1);
    ctx.fillStyle = "#143c3a";
    ctx.fillRect(x, y, s, Math.max(3, s * 0.16));
    ctx.fillStyle = "#b85a3c";
    ctx.fillRect(x, y + s * 0.42, s, Math.max(2, s * 0.1));
    ctx.fillStyle = "#e6d3ae";
    ctx.beginPath();
    ctx.arc(x + s * 0.24, y + s * 0.74, Math.max(1.2, s * 0.045), 0, Math.PI * 2);
    ctx.arc(x + s * 0.76, y + s * 0.74, Math.max(1.2, s * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGoal(ctx, x, y, s) {
    const pad = s * 0.12;
    const len = s * 0.14;
    ctx.strokeStyle = "rgba(243, 236, 220, 0.92)";
    ctx.lineWidth = Math.max(1.5, s * 0.045);
    ctx.lineCap = "round";
    const marks = [
      [x + pad, y + pad, 1, 1],
      [x + s - pad, y + pad, -1, 1],
      [x + pad, y + s - pad, 1, -1],
      [x + s - pad, y + s - pad, -1, -1],
    ];
    marks.forEach((mark) => {
      ctx.beginPath();
      ctx.moveTo(mark[0], mark[1] + mark[3] * len);
      ctx.lineTo(mark[0], mark[1]);
      ctx.lineTo(mark[0] + mark[2] * len, mark[1]);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 2, s * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(243, 236, 220, 0.88)";
    ctx.fill();
  }

  function drawCrate(ctx, x, y, s, onGoal) {
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.3, s * 0.26, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = onGoal ? "#f0d7a4" : "#e7c48a";
    roundRect(ctx, -s * 0.28, -s * 0.34, s * 0.56, s * 0.16, 3);
    ctx.fill();

    ctx.fillStyle = onGoal ? "#e0a15c" : "#d08945";
    roundRect(ctx, -s * 0.28, -s * 0.2, s * 0.56, s * 0.46, 4);
    ctx.fill();

    ctx.fillStyle = "#6e3c1c";
    ctx.fillRect(-s * 0.28, -s * 0.05, s * 0.56, Math.max(2, s * 0.055));
    ctx.fillRect(-s * 0.04, -s * 0.2, Math.max(2, s * 0.07), s * 0.46);

    ctx.strokeStyle = "rgba(90, 42, 16, 0.75)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-s * 0.12, s * 0.02, s * 0.22, s * 0.14);
    ctx.restore();
  }

  function drawWorker(ctx, player, s, stride, pushing) {
    const facing = player.facing || "down";
    const lean = pushing ? 0.1 : 0.03;
    const fx = facing === "left" ? -1 : facing === "right" ? 1 : 0;
    const fy = facing === "up" ? -1 : facing === "down" ? 1 : 0;
    const step = Math.sin(stride * Math.PI);

    ctx.save();
    ctx.translate((player.x + 0.5 + fx * lean) * s, (player.y + 0.46 + fy * lean) * s);
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.28, s * 0.16, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    if (facing === "left") ctx.scale(-1, 1);

    ctx.fillStyle = "#2a3338";
    roundRect(ctx, -s * 0.13, s * 0.05, s * 0.09, s * 0.16, 2);
    ctx.fill();
    roundRect(ctx, s * 0.04, s * 0.05 + step * s * 0.04, s * 0.09, s * 0.16, 2);
    ctx.fill();

    ctx.fillStyle = "#1b1b1b";
    roundRect(ctx, -s * 0.15, s * 0.18, s * 0.1, s * 0.05, 1);
    ctx.fill();
    roundRect(ctx, s * 0.05, s * 0.18 + step * s * 0.04, s * 0.1, s * 0.05, 1);
    ctx.fill();

    ctx.fillStyle = "#f6f1e6";
    roundRect(ctx, -s * 0.15, -s * 0.12, s * 0.3, s * 0.24, s * 0.08);
    ctx.fill();
    ctx.fillStyle = "#e4572e";
    roundRect(ctx, -s * 0.15, -s * 0.12, s * 0.3, s * 0.13, s * 0.06);
    ctx.fill();

    ctx.fillStyle = "#f3c7a4";
    roundRect(ctx, s * 0.11, -s * 0.02, s * 0.07, s * 0.14, 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, -s * 0.2, s * 0.105, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1b1b1b";
    ctx.beginPath();
    ctx.arc(0, -s * 0.24, s * 0.105, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-s * 0.13, -s * 0.24, s * 0.28, s * 0.035);

    if (facing !== "up") {
      ctx.fillStyle = "#1b1b1b";
      ctx.fillRect(s * 0.035, -s * 0.16, s * 0.028, s * 0.035);
    }
    ctx.restore();
  }

  function drawHint(ctx, player, dir, s, time) {
    const step = DIRS[dir];
    if (!step) return;
    const bob = Math.sin(time / 150) * s * 0.05;
    ctx.save();
    ctx.translate((player.x + step.x + 0.5) * s, (player.y + step.y + 0.5) * s + bob);
    ctx.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir]);
    ctx.fillStyle = "rgba(240, 212, 138, 0.95)";
    ctx.beginPath();
    ctx.moveTo(s * 0.16, 0);
    ctx.lineTo(-s * 0.08, s * 0.1);
    ctx.lineTo(-s * 0.08, -s * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHover(ctx, hover, s, walls) {
    if (walls.has(hover.x + "," + hover.y)) return;
    ctx.strokeStyle = "rgba(215, 163, 90, 0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(hover.x * s + 3, hover.y * s + 3, s - 6, s - 6);
  }

  function drawParticle(ctx, particle, s) {
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x * s, particle.y * s, Math.max(1.5, s * 0.045), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
})();
