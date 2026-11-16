const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(file) {
  const code = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  vm.runInThisContext(code, { filename: file });
}

load("js/levels.js");
load("js/engine.js");
load("js/store.js");

const S = globalThis.DockSokoban;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error("FAIL", message);
  }
}

function replay(state, dirs) {
  let current = state;
  for (let i = 0; i < dirs.length; i++) {
    const result = S.tryMove(current, dirs[i]);
    if (!result.ok) return { ok: false, state: current, at: i };
    current = result.state;
  }
  return { ok: true, state: current };
}

function ruleTests() {
  const corner = S.loadLevel({
    name: "corner",
    rows: ["#####", "#$ .#", "# @ #", "#####"],
  });
  assert(S.isDeadlocked(corner), "墙角箱子应判死局");
  assert(S.solve(corner, { prune: false, maxMs: 1000 }).status === "stuck", "墙角关卡无解");

  const along = S.loadLevel({
    name: "along",
    rows: ["######", "# $ .#", "# @  #", "######"],
  });
  assert(!S.isDeadlocked(along), "沿墙可以滑向目标，不是死局");
  const alongSolved = S.solve(along, { maxMs: 1000 });
  const alongOpen = S.solve(along, { prune: false, maxMs: 1000 });
  assert(alongSolved.status === "solved", "沿墙关卡应可解");
  assert(alongOpen.status === "solved", "关闭剪枝后沿墙关卡仍可解");
  assert(alongSolved.path.length === alongOpen.path.length, "剪枝不能改变最短步数");

  const trap = S.loadLevel({
    name: "trap",
    rows: ["######", "# $  #", "#  . #", "# @  #", "######"],
  });
  assert(S.isDeadlocked(trap), "贴着没有目标的墙应判死局");
  assert(S.solve(trap, { prune: false, maxMs: 1000 }).status === "stuck", "贴墙无目标应无解");

  const level1 = S.loadLevel(S.LEVELS[0]);
  const before = level1.boxes[0].x;
  const moved = S.tryMove(level1, "right");
  assert(moved.ok && moved.pushed, "第一关向右应推动箱子");
  assert(level1.boxes[0].x === before, "推动不能改写原状态");
  assert(S.isWin(moved.state), "第一关推一步后过关");
  assert(!S.tryMove(level1, "up").ok, "不能走进墙");

  const pull = S.loadLevel({
    name: "pull",
    rows: ["########", "#. $ @ #", "########"],
  });
  const away = S.tryMove(pull, "right");
  assert(away.ok && !away.pushed, "离开箱子只是走路");
  assert(away.state.boxes[0].x === pull.boxes[0].x, "不能把箱子拉过来");

  const blockedGoal = S.planClick(level1, 3, 1);
  assert(blockedGoal == null, "箱子挡住目标时不能穿过去");
  const pushPlan = S.planClick(level1, level1.boxes[0].x, level1.boxes[0].y);
  assert(pushPlan && pushPlan.join() === "right", "点箱子应就地向前推");

  const detour = S.loadLevel({
    name: "detour",
    rows: ["######", "#@#  #", "# #$.#", "#    #", "######"],
  });
  const walked = S.walkPath(detour, 3, 1);
  assert(walked && walked.length >= 4, "应能绕开墙走到另一侧");
  const walkedState = replay(detour, walked);
  assert(walkedState.ok, "绕路的每一步都走得通");
  assert(walkedState.state.player.x === 3 && walkedState.state.player.y === 1, "绕路应到达目标格");
}

function storeTests() {
  const count = S.LEVELS.length;
  const blank = S.sanitizeStore(null, count);
  assert(blank.level === 0, "空存档应回到第一关");
  assert(Object.keys(blank.cleared).length === 0, "空存档应没有通关记录");
  assert(Object.keys(blank.best).length === 0, "空存档应没有最佳成绩");
  assert(blank.muted === false, "空存档默认打开声音");

  [undefined, 42, "旧格式", [], true, { version: 2 }, { version: 0 }, { version: "1" }].forEach(
    (raw, index) => {
      const clean = S.sanitizeStore(raw, count);
      assert(
        clean.level === 0 &&
          Object.keys(clean.cleared).length === 0 &&
          Object.keys(clean.best).length === 0 &&
          clean.muted === false,
        "无效存档 #" + index + " 应整体回退"
      );
    }
  );

  const clean = S.sanitizeStore(
    {
      version: S.STORE_VERSION,
      level: 5,
      cleared: { 0: true, 5: true, 16: true, "-1": true, abc: true, 1: false },
      best: {
        0: { moves: 12, pushes: 4 },
        1: { moves: -1, pushes: 0 },
        2: { moves: 3.5, pushes: 2 },
        3: { moves: 4, pushes: "2" },
        4: { moves: 4 },
        5: { moves: 10, pushes: 3 },
        16: { moves: 1, pushes: 1 },
        7: null,
      },
      muted: true,
    },
    count
  );
  assert(clean.level === 5, "有效关卡应保留");
  assert(clean.cleared[0] === true && clean.cleared[5] === true, "范围内的通关记录应保留");
  assert(Object.keys(clean.cleared).length === 2, "越界或非 true 的通关记录应丢弃");
  assert(clean.best[0].moves === 12 && clean.best[0].pushes === 4, "完整最佳成绩应保留");
  assert(clean.best[5].moves === 10 && clean.best[5].pushes === 3, "另一条最佳成绩应保留");
  assert(Object.keys(clean.best).length === 2, "结构异常的最佳成绩应丢弃");
  assert(clean.muted === true, "布尔静音状态应保留");

  assert(S.sanitizeStore({ level: 99 }, count).level === 0, "越界关卡应回到第一关");
  assert(S.sanitizeStore({ level: 1.5 }, count).level === 0, "小数关卡应回到第一关");
  assert(S.sanitizeStore({ muted: "yes" }, count).muted === false, "非布尔静音状态应回退");
  assert(S.sanitizeStore({ cleared: [true] }, count).cleared[0] === undefined, "数组形式的通关记录无效");
  assert(S.sanitizeStore({ best: 3 }, count).best[0] === undefined, "数字形式的最佳成绩无效");

  const legacy = S.sanitizeStore({ level: 3, best: { 3: { moves: 8, pushes: 2 } } }, count);
  assert(legacy.level === 3 && legacy.best[3].moves === 8, "旧版无 version 的存档仍应可用");

  const polluted = S.sanitizeStore(
    JSON.parse('{"cleared":{"__proto__":true},"best":{"__proto__":{"moves":1,"pushes":1}}}'),
    count
  );
  assert(!Object.prototype.hasOwnProperty.call(polluted.cleared, "__proto__"), "存档键不能污染通关记录");
  assert(Object.prototype.moves === undefined, "校验存档不能污染原型");
  assert(Object.keys(polluted.cleared).length === 0, "非法存档键应全部丢弃");
}

function levelTests() {
  S.LEVELS.forEach((level, index) => {
    let start;
    try {
      start = S.loadLevel(level);
    } catch (error) {
      assert(false, level.name + " 无法读取：" + error.message);
      return;
    }

    for (let x = 0; x < start.width; x++) {
      assert(start.walls.has(x + ",0") && start.walls.has(x + "," + (start.height - 1)), level.name + " 上下边界不是墙");
    }
    for (let y = 0; y < start.height; y++) {
      assert(start.walls.has("0," + y) && start.walls.has(start.width - 1 + "," + y), level.name + " 左右边界不是墙");
    }
    assert(!S.isWin(start), level.name + " 开局不应已经过关");
    assert(!S.isDeadlocked(start), level.name + " 开局不应是死局");

    const px = start.player.x;
    const py = start.player.y;
    const startedAt = performance.now();
    const result = S.solve(start, { maxMs: 3000, maxStates: 400000 });
    const ms = performance.now() - startedAt;
    assert(start.player.x === px && start.player.y === py, level.name + " 求解不能改写局面");

    if (result.status !== "solved") {
      assert(false, level.name + " " + result.status + " " + ms.toFixed(0) + "ms");
      return;
    }

    let pushes = 0;
    let sim = start;
    for (let step = 0; step < result.path.length; step++) {
      const moved = S.tryMove(sim, result.path[step]);
      assert(moved.ok, level.name + " 第 " + step + " 步走不通");
      if (!moved.ok) return;
      if (moved.pushed) pushes += 1;
      sim = moved.state;
      if (step < result.path.length - 1) assert(!S.isWin(sim), level.name + " 提前过关");
    }
    assert(S.isWin(sim), level.name + " 走完没有过关");
    if (ms < 250) {
      const open = S.solve(start, { prune: false, maxMs: 1500, maxStates: 500000 });
      if (open.status === "solved") {
        assert(open.path.length === result.path.length, level.name + " 剪枝改变了最短步数");
      } else if (open.status === "stuck") {
        assert(false, level.name + " 剪枝把有解局面判死了");
      }
    }
    if (level.par) assert(level.par === result.path.length, level.name + " 参考步数应为 " + result.path.length);
    console.log(
      String(index + 1).padStart(2, " "),
      level.name.padEnd(6, "　"),
      "steps=" + String(result.path.length).padStart(3, " "),
      "pushes=" + String(pushes).padStart(2, " "),
      ms.toFixed(1).padStart(7, " ") + "ms"
    );
  });
}

ruleTests();
storeTests();
levelTests();

if (failed) {
  console.error(failed + " 项失败");
  process.exit(1);
}
console.log("全部通过，共 " + S.LEVELS.length + " 关");
