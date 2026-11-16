(function () {
  const S = (globalThis.DockSokoban = globalThis.DockSokoban || {});

  // 本地存档：结构或版本不对时回退到默认进度，避免把脏数据显示在界面上。
  const STORE_KEY = "dock-sokoban-v1";
  const STORE_VERSION = 1;

  function emptyStore() {
    return { level: 0, cleared: {}, best: {}, muted: false };
  }

  function isLevelIndex(value, levelCount) {
    return Number.isInteger(value) && value >= 0 && value < levelCount;
  }

  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function sanitizeStore(raw, levelCount) {
    const clean = emptyStore();
    if (!isRecord(raw)) return clean;
    if (
      raw.version !== undefined &&
      (!Number.isInteger(raw.version) || raw.version < 1 || raw.version > STORE_VERSION)
    ) {
      return clean;
    }

    const count = Number.isInteger(levelCount) && levelCount > 0 ? levelCount : 0;
    if (isLevelIndex(raw.level, count)) clean.level = raw.level;
    if (raw.muted === true || raw.muted === false) clean.muted = raw.muted;

    if (isRecord(raw.cleared)) {
      Object.keys(raw.cleared).forEach((key) => {
        if (!/^\d+$/.test(key)) return;
        const index = Number(key);
        if (isLevelIndex(index, count) && raw.cleared[key] === true) clean.cleared[index] = true;
      });
    }

    if (isRecord(raw.best)) {
      Object.keys(raw.best).forEach((key) => {
        if (!/^\d+$/.test(key)) return;
        const index = Number(key);
        const record = raw.best[key];
        if (!isLevelIndex(index, count) || !isRecord(record)) return;
        const moves = record.moves;
        const pushes = record.pushes;
        if (Number.isInteger(moves) && moves >= 0 && Number.isInteger(pushes) && pushes >= 0) {
          clean.best[index] = { moves, pushes };
        }
      });
    }

    return clean;
  }

  S.STORE_KEY = STORE_KEY;
  S.STORE_VERSION = STORE_VERSION;
  S.sanitizeStore = sanitizeStore;
})();
