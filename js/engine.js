(function () {
  const S = (globalThis.DockSokoban = globalThis.DockSokoban || {});

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const DIR_NAMES = ["up", "down", "left", "right"];

  function key(x, y) {
    return x + "," + y;
  }

  function loadLevel(level) {
    const rows = level.rows;
    if (!rows || !rows.length) throw new Error("关卡是空的");
    const width = rows[0].length;
    const height = rows.length;
    if (rows.some((row) => row.length !== width)) {
      throw new Error("关卡不是矩形：" + (level.name || ""));
    }

    const walls = new Set();
    const goals = new Set();
    const boxes = [];
    let player = null;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = rows[y][x];
        if (cell === "#") walls.add(key(x, y));
        else if (cell === "@") player = { x, y };
        else if (cell === "+") {
          player = { x, y };
          goals.add(key(x, y));
        } else if (cell === "$") boxes.push({ x, y });
        else if (cell === "*") {
          boxes.push({ x, y });
          goals.add(key(x, y));
        } else if (cell === ".") goals.add(key(x, y));
        else if (cell !== " ") {
          throw new Error("无法识别的格子 " + cell + " @" + x + "," + y);
        }
      }
    }

    if (!player) throw new Error("缺少工人：" + (level.name || ""));
    if (!boxes.length) throw new Error("缺少箱子：" + (level.name || ""));
    if (boxes.length !== goals.size) {
      throw new Error("箱子和目标数量不一致：" + (level.name || ""));
    }

    return {
      width,
      height,
      walls,
      goals,
      boxes,
      player,
      facing: initialFacing(player, boxes),
    };
  }

  function initialFacing(player, boxes) {
    let best = boxes[0];
    let bestDist = Infinity;
    for (let i = 0; i < boxes.length; i++) {
      const dist = Math.abs(boxes[i].x - player.x) + Math.abs(boxes[i].y - player.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = boxes[i];
      }
    }
    if (Math.abs(best.x - player.x) >= Math.abs(best.y - player.y)) {
      return best.x >= player.x ? "right" : "left";
    }
    return best.y >= player.y ? "down" : "up";
  }

  function blocked(state, x, y) {
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return true;
    return state.walls.has(key(x, y));
  }

  function tryMove(state, dir) {
    const step = DIRS[dir];
    if (!step) return { ok: false };
    const nx = state.player.x + step.x;
    const ny = state.player.y + step.y;
    if (blocked(state, nx, ny)) return { ok: false };

    let boxIndex = -1;
    for (let i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].x === nx && state.boxes[i].y === ny) {
        boxIndex = i;
        break;
      }
    }

    if (boxIndex === -1) {
      return { ok: true, pushed: false, state: nextState(state, nx, ny, state.boxes, dir) };
    }

    const bx = nx + step.x;
    const by = ny + step.y;
    if (blocked(state, bx, by)) return { ok: false };
    for (let i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].x === bx && state.boxes[i].y === by) return { ok: false };
    }

    const boxes = state.boxes.slice();
    boxes[boxIndex] = { x: bx, y: by };
    return { ok: true, pushed: true, state: nextState(state, nx, ny, boxes, dir) };
  }

  function nextState(state, x, y, boxes, dir) {
    return {
      width: state.width,
      height: state.height,
      walls: state.walls,
      goals: state.goals,
      boxes,
      player: { x, y },
      facing: dir,
    };
  }

  function isWin(state) {
    if (!state.boxes.length || state.boxes.length !== state.goals.size) return false;
    for (let i = 0; i < state.boxes.length; i++) {
      if (!state.goals.has(key(state.boxes[i].x, state.boxes[i].y))) return false;
    }
    return true;
  }

  // 贴墙的箱子不能被朝墙的反方向推（人站不进墙里）。
  // 拐角里的箱子完全推不动；整段墙上没有目标时，沿墙滑动也到不了终点。
  function isDeadlocked(state) {
    for (let i = 0; i < state.boxes.length; i++) {
      if (boxStuck(state, state.boxes[i])) return true;
    }
    return false;
  }

  function boxStuck(state, box) {
    if (state.goals.has(key(box.x, box.y))) return false;
    const north = blocked(state, box.x, box.y - 1);
    const south = blocked(state, box.x, box.y + 1);
    const west = blocked(state, box.x - 1, box.y);
    const east = blocked(state, box.x + 1, box.y);
    if ((north || south) && (west || east)) return true;
    if (north && closedTunnel(state, box.x, box.y, 0, -1, 1, 0)) return true;
    if (south && closedTunnel(state, box.x, box.y, 0, 1, 1, 0)) return true;
    if (west && closedTunnel(state, box.x, box.y, -1, 0, 0, 1)) return true;
    if (east && closedTunnel(state, box.x, box.y, 1, 0, 0, 1)) return true;
    return false;
  }

  function closedTunnel(state, x, y, wx, wy, sx, sy) {
    const cells = [{ x, y }];
    for (let sign = -1; sign <= 1; sign += 2) {
      let cx = x;
      let cy = y;
      while (true) {
        const nx = cx + sx * sign;
        const ny = cy + sy * sign;
        if (blocked(state, nx, ny)) break;
        if (!blocked(state, nx + wx, ny + wy)) return false;
        cells.push({ x: nx, y: ny });
        cx = nx;
        cy = ny;
      }
    }
    for (let i = 0; i < cells.length; i++) {
      if (state.goals.has(key(cells[i].x, cells[i].y))) return false;
    }
    return true;
  }

  function stateKey(state) {
    const width = state.width;
    const parts = [];
    for (let i = 0; i < state.boxes.length; i++) {
      parts.push(state.boxes[i].y * width + state.boxes[i].x);
    }
    parts.sort((a, b) => a - b);
    return state.player.x + "," + state.player.y + "|" + parts.join(".");
  }

  function solve(state, options) {
    const maxStates = (options && options.maxStates) || 200000;
    const maxMs = (options && options.maxMs) || 100;
    const prune = !options || options.prune !== false;
    if (isWin(state)) return { status: "solved", path: [], expanded: 0 };
    if (prune && isDeadlocked(state)) return { status: "stuck", path: [], expanded: 0 };

    const nodes = [{ state, prev: -1, dir: null }];
    const seen = new Set([stateKey(state)]);
    const started = Date.now();
    let head = 0;

    while (head < nodes.length) {
      if (nodes.length > maxStates) return { status: "timeout", path: [], expanded: head };
      if ((head & 1023) === 0 && Date.now() - started > maxMs) {
        return { status: "timeout", path: [], expanded: head };
      }

      const current = nodes[head];
      if (isWin(current.state)) {
        return { status: "solved", path: rebuild(nodes, head), expanded: head };
      }

      for (let d = 0; d < DIR_NAMES.length; d++) {
        const dir = DIR_NAMES[d];
        const result = tryMove(current.state, dir);
        if (!result.ok) continue;
        if (prune && isDeadlocked(result.state)) continue;
        const id = stateKey(result.state);
        if (seen.has(id)) continue;
        seen.add(id);
        nodes.push({ state: result.state, prev: head, dir });
      }
      head += 1;
    }

    return { status: "stuck", path: [], expanded: head };
  }

  function rebuild(nodes, index) {
    const path = [];
    let cursor = index;
    while (cursor > 0) {
      path.push(nodes[cursor].dir);
      cursor = nodes[cursor].prev;
    }
    path.reverse();
    return path;
  }

  function walkPath(state, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) return null;
    if (state.player.x === tx && state.player.y === ty) return [];
    const blockedCells = new Set(state.walls);
    for (let i = 0; i < state.boxes.length; i++) {
      blockedCells.add(key(state.boxes[i].x, state.boxes[i].y));
    }
    if (blockedCells.has(key(tx, ty))) return null;

    const nodes = [{ x: state.player.x, y: state.player.y, prev: -1, dir: null }];
    const seen = new Set([key(state.player.x, state.player.y)]);
    let head = 0;

    while (head < nodes.length) {
      const current = nodes[head];
      if (current.x === tx && current.y === ty) {
        const path = [];
        let cursor = head;
        while (cursor > 0) {
          path.push(nodes[cursor].dir);
          cursor = nodes[cursor].prev;
        }
        path.reverse();
        return path;
      }

      for (let d = 0; d < DIR_NAMES.length; d++) {
        const dir = DIR_NAMES[d];
        const step = DIRS[dir];
        const nx = current.x + step.x;
        const ny = current.y + step.y;
        const id = key(nx, ny);
        if (seen.has(id) || blockedCells.has(id)) continue;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        seen.add(id);
        nodes.push({ x: nx, y: ny, prev: head, dir });
      }
      head += 1;
    }

    return null;
  }

  function planClick(state, x, y) {
    const box = state.boxes.find((item) => item.x === x && item.y === y);
    if (!box) {
      if (blocked(state, x, y)) return null;
      return walkPath(state, x, y);
    }

    let best = null;
    for (let d = 0; d < DIR_NAMES.length; d++) {
      const dir = DIR_NAMES[d];
      const step = DIRS[dir];
      const stanceX = box.x - step.x;
      const stanceY = box.y - step.y;
      const destX = box.x + step.x;
      const destY = box.y + step.y;
      if (blocked(state, destX, destY)) continue;
      if (state.boxes.some((item) => item.x === destX && item.y === destY)) continue;

      if (state.player.x === stanceX && state.player.y === stanceY) return [dir];
      if (blocked(state, stanceX, stanceY)) continue;
      if (state.boxes.some((item) => item.x === stanceX && item.y === stanceY)) continue;

      const walk = walkPath(state, stanceX, stanceY);
      if (!walk) continue;
      const plan = walk.concat(dir);
      if (!best || plan.length < best.length) best = plan;
    }
    return best;
  }

  S.DIRS = DIRS;
  S.DIR_NAMES = DIR_NAMES;
  S.key = key;
  S.loadLevel = loadLevel;
  S.tryMove = tryMove;
  S.isWin = isWin;
  S.isDeadlocked = isDeadlocked;
  S.solve = solve;
  S.walkPath = walkPath;
  S.planClick = planClick;
})();
