# 推箱子 · 码头夜班

纯静态的浏览器推箱子小游戏：HTML、CSS、原生 JavaScript 和 Canvas，无构建步骤、无第三方依赖，直接打开 `index.html` 即可游玩。

![CI](https://github.com/zzh-dsAgent/smallGame/actions/workflows/ci.yml/badge.svg)

## 玩法

把每个木箱推到白色标记上。箱子只能向前推，不能拉；推错了就撤销。所有箱子归位即过关。

## 快速开始

直接双击 `index.html`，或在项目目录启动一个静态服务器：

```bash
python3 -m http.server 8000
# 然后访问 http://127.0.0.1:8000/
```

项目没有构建步骤，也没有需要安装的依赖；修改源码后刷新页面即可。

## 操作

| 操作 | 键盘 | 鼠标 / 触屏 |
| --- | --- | --- |
| 移动 / 推箱 | `↑` `↓` `←` `→` 或 `W` `A` `S` `D` | 点击空地自动寻路；点击箱子推一步；在棋盘上滑动按方向移动 |
| 撤销 | `Z`、`Backspace` 或 `Esc` | 「撤销」按钮 |
| 重开本关 | `R` | 「重开」按钮 |
| 下一步提示 | `H` | 「提示」按钮 |
| 上一关 / 下一关 | `[` / `]` | 「上一关」「下一关」按钮 |

## 功能

- 16 个内置关卡，可随时切换，记录每关步数与推箱数。
- 撤销、重开、求解器提示；提示会识别已推死的局面。
- 参考步数（par）由求解器核对为最短步数。
- 本地保存关卡位置、通关记录、最佳成绩和声音设置，刷新后继续。
- 方块动画、过关庆祝、音效开关；跟随系统「减弱动态效果」设置。
- 响应式布局：棋盘会随窗口宽高变化重新适配，手机地址栏收放后也会重新计算尺寸。
- 存档结构校验：本地数据损坏、版本不符或字段类型异常时回退为默认进度，不会把脏数据显示到界面上。

### 存档

进度保存在 `localStorage` 的 `dock-sokoban-v1` 键中，写入时带存档版本号。需要清除进度时，在浏览器开发者工具中执行：

```js
localStorage.removeItem("dock-sokoban-v1");
```

刷新页面后即回到初始状态。

## 项目结构

```text
index.html              页面结构
css/style.css           页面样式与响应式布局
js/levels.js            16 个关卡与关卡格式
js/engine.js            规则、死局判断、点击寻路与求解器
js/render.js            Canvas 绘制
js/audio.js             WebAudio 音效
js/store.js             本地存档读取与结构校验
js/main.js              游戏状态、输入、动画与 HUD 更新
tests/check.js          规则、存档与全部关卡的 Node.js 测试
.github/workflows/ci.yml GitHub Actions 持续集成
```

## 测试与 CI

测试不依赖浏览器或第三方库，需要 Node.js 18 及以上版本：

```bash
node tests/check.js
```

测试覆盖推箱规则、撤销/寻路所依赖的引擎逻辑、存档校验，并逐关用求解器验证可解性与参考步数。GitHub Actions 在推送到 `main` 和提交 Pull Request 时自动执行语法检查与测试。

## 添加关卡

在 `js/levels.js` 的 `S.LEVELS` 中追加关卡。`rows` 是等宽的字符行，支持：

| 字符 | 含义 |
| --- | --- |
| `#` | 墙 |
| `@` | 工人 |
| `$` | 箱子 |
| `.` | 目标 |
| `+` | 工人站在目标上 |
| `*` | 箱子已在目标上 |
| 空格 | 地板 |

`par` 填最短步数，运行 `node tests/check.js` 会检查它是否与求解器一致。关卡边界需要是墙，箱子和目标数量必须相同。

## 浏览器支持

支持 Canvas、Pointer Events 和 `localStorage` 的现代浏览器，包括近年的 Chrome、Edge、Firefox 和 Safari。音效使用 WebAudio，不可用时游戏其余部分不受影响。
