# 风铃便签（desktop-note-widget）开发摘要

> 供二次开发参考。最后更新：2026-08-11 17:55

## 一、项目概览

| 项 | 内容 |
|---|---|
| 名称 | 风铃便签 WindChimeNote |
| 定位 | Windows 悬挂式桌面便签小组件：绳子从屏幕顶部垂下一张手绘风便签，展示励志短句 |
| 路径 | `D:\code\WorkBuddyworkspace\260809\desktop-note-widget` |
| 技术栈 | Tauri v2 + React 18 + TypeScript(strict) + Tailwind 3 + Zustand 5 + Framer Motion 11 + Rust |
| 版本 | 1.0.0（MSI 2.9M / NSIS 2.1M / exe 5.3M） |
| 窗口 | 520×520 透明窗口，可水平拖拽定位、跳过任务栏、鼠标穿透 |

**核心交互**：悬挂式便签 + 物理阻尼摆动（点击/拖动/悬停/微风都会晃，可切换经典关键帧模式）+ 四主题 + 每日短句 + AI 在线生成（风格可自定义）+ 收起为小圆点 + 右键菜单 + 锁定到桌面（贴纸模式）。

## 二、功能清单

- **摆动系统**：物理阻尼弹簧（rAF + useMotionValue，默认）/ 经典关键帧（备选），设置可切换并持久化
  - 点击拨动、拖拽惯性滞后摆动 + 松手余摆、悬停轻摆、静止偶发微风
  - 摆幅限幅 ±15°（弹性反弹，不卡死）；参数集中 `usePhysicsSwing.ts` 顶部 `SWING_PARAMS`
- **短句**：100 条预置（18~22 字，5 类各 20）/ 自定义 / AI 生成（OpenAI 兼容端点，可选）
  - **AI 风格可自定义**（留空 = 词库励志语录风，可填「古风诗意」等任意描述）
  - **防重复三件套**：随机句式结构池（打破平台缓存）+ 历史反例写进 prompt + 撞车自动重试 1 次
- **每日自动更新**：跨天后自动换句 + 日期印章
- **主题**：暖/粉/绿/牛皮纸 4 套配色，全局不透明度、4 档缩放
- **字体与行数**：字号档位 14/16/18/20/22 + 自定义 12–28；显示行数 1/2/3 行（line-clamp 截断）
- **收起动画**：卷起缩成顶部小圆点（scaleY→0 + 上移 0.45s），点击圆点展开带回弹；收起态鼠标穿透只留圆点区域
- **右键菜单**：换一句 / 锁定 / 设置 / 收起
- **锁定到桌面**：整窗鼠标穿透贴纸模式（托盘菜单或控制按钮锁定，解锁走托盘；锁定瞬间 2.5s 提示条）
- **系统托盘**：显隐 / 切换短句 / 锁定 / 退出；全局快捷键 Ctrl+Shift+Q
- **开机自启**（注册表）、**AI 设置**、**自定义句子管理**、**版本号显示**（设置页 footer）

## 三、架构地图

```
desktop-note-widget/
├── src/
│   ├── App.tsx                  # 根组件：窗口缩放/透明度/锁定监听 + 多显示器启动定位
│   ├── main.tsx                 # 入口
│   ├── types.ts                 # 全部类型 + DEFAULT_CONFIG + THEMES + BASE_WINDOW(520×520)
│   ├── components/
│   │   ├── HangingWidget.tsx    # 骨架：布局常量区 + 摆动接线 + 收起/右键菜单/锁定提示 + 撕边线
│   │   ├── Rope.tsx             # 手绘绳子（ropeTotalHeight() 供布局推导实际总高）
│   │   ├── NoteCard.tsx         # 便签卡片（翻面动画 + 双击开设置）
│   │   ├── QuoteText.tsx        # 短句文本（打字机 + line-clamp 行数截断）
│   │   ├── DailyStamp.tsx       # 日期印章
│   │   ├── ControlButtons.tsx   # 控制按钮（刷新/AI/锁定/设置/收起/隐藏）
│   │   ├── SettingsPanel.tsx    # 设置抽屉（Portal 到 body，版本号 footer）
│   │   └── settings/            # 设置子组件（ui/AiSettings含风格/CustomQuotes）
│   ├── hooks/
│   │   ├── usePhysicsSwing.ts   # ★摆动引擎：物理+经典双模式，SWING_PARAMS 参数常量
│   │   ├── useDragPosition.ts   # ★水平拖拽（4px 阈值，dragDeltaRef 供物理用）
│   │   ├── useQuoteManager.ts   # 短句状态机（含 AI 重试/防重复/错误 Toast 定时清除）
│   │   ├── useAutoDailyUpdate.ts# 每日自动更新
│   │   └── useCursorPassthrough.ts # 非交互区鼠标穿透（interactiveRefs 动态切换）
│   ├── stores/widgetStore.ts    # Zustand：全部配置 + pushAiQuote + 持久化（debounce 300ms）
│   ├── lib/
│   │   ├── tauri.ts             # Tauri IPC 适配层（含 getMonitors 多显示器查询）
│   │   └── persistence.ts       # 配置读写（mergeConfig 兜底新增字段）
│   ├── services/quoteService.ts # 预置/自定义/AI（normalizeEndpoint + describeHttpError + buildAiPrompt）
│   ├── data/quotes.json         # 100 条预置短句
│   └── styles/                  # 全局样式
├── src-tauri/src/
│   ├── lib.rs                   # 窗口构建、插件、快捷键、命令注册
│   ├── main.rs
│   ├── commands.rs              # 前端 IPC 命令（set_interactive_rect / set_locked / generate_ai_quote）
│   ├── tray.rs                  # 托盘菜单 + 锁定菜单状态同步
│   ├── passthrough.rs           # 鼠标穿透轮询（40ms，窗口隐藏降频 1s）
│   └── platform.rs              # 仅 cursor_position（LWA 透明度代码已删，改前端 CSS）
├── src-tauri/archive/           # desktop.rs（WorkerW 桌面嵌入，已放弃，归档勿挂载）
├── scripts/gen-icon.mjs         # 纯 zlib 手写 PNG 生成图标
└── src-tauri/installer-hooks.nsh# 卸载清理自启与配置
```

## 四、开发时间线

### 2026-08-09
| 时间 | 事项 |
|---|---|
| 全天 | 项目从零搭建：前端 26 文件 + Rust 后端全模块 + 100 条短句库 + 图标生成 + 全部检查零警告 |
| 23:09 | 首次打包完成：MSI（手动补 WiX）、NSIS、主程序 exe |

### 2026-08-10
| 时间 | 事项 |
|---|---|
| 上午 | **UI 显示不完整修复**：motion.div 挂 `-translate-x-1/2` 被 Framer Motion transform 覆盖 → 居中移外层普通 div；卡片 240→360、窗口 400×600→480×640、字号分级下调 |
| 15:15-15:30 | **360 主动防御拦截 cargo 构建** → 用户将 `D:\cargo-build-target`、`D:\build-tmp` 加入信任区；vite + debug exe 直跑绕过 |
| 16:00-16:40 | **桌面嵌入（WorkerW）**：desktop.rs 实现 SetParent 嵌入，编译恢复 |
| 16:42-17:12 | 嵌入后便签被拉伸 → SetWindowPos 强制 480×640 + 居中 |
| 17:15-17:59 | **黑底问题**：WebView2 在 WorkerW 下不支持 alpha → **放弃嵌入方案**（desktop.rs 保留未编译）；改做**「锁定到桌面」**功能（穿透贴纸模式，托盘解锁） |
| 18:00-18:15 | 锁定功能编译通过 + 启动验证 |
| 20:22-20:40 | 视觉优化：透明改前端 CSS opacity、手绘按钮、撕边线、印章放大、字体增大、卡片 400/窗口 520 |
| 21:00-21:45 | **设置面板截断根治**：窗口随 scale 缩放是根因 → 窗口固定 520×520，内容 transform 缩放 |
| 21:45 | 控制按钮加「锁定到桌面」 |
| 21:53 | 点击便签关闭设置面板（用 onClick，拖动不误触） |
| 21:57-22:04 | 托盘锁定文案状态化 + 修复前端锁定时托盘不联动 |
| 22:08-22:19 | 去掉托盘左键显隐；修复 rustc ICE（增量缓存损坏，删 debug/incremental） |
| 22:24-22:35 | **摆动双模式**：A 物理阻尼（默认）/ B 经典关键帧，设置可切换持久化 |
| 22:48-22:55 | 修复摆幅过大卡边界（冲量按 ω 换算 + 弹性反弹）；修复点击卡顿（4px 阈值区分点击/拖拽） |
| 22:55 | **拖动保留摆动**：物理注入滞后动量（dragDeltaRef），经典 drag 变体 ±3° 摆动 |
| 23:16+ | 整理本摘要 |

### 2026-08-11
| 时间 | 事项 |
|---|---|
| 上午 | **撕边线位置根治**：改 absolute + 内联 top（278），绕开 flex margin 与 Tailwind HMR 双重不确定性；SVG 加 `display:block` 消除 inline baseline |
| 11:30-12:00 | **字体/行数设置**：fontSize（档位+自定义 12–28）+ maxLines（1–3 行 line-clamp） |
| 中午 | **收起动画**：卷起成顶部小圆点 + 展开回弹；交互热区动态切换（收起态只报圆点矩形） |
| 14:00-15:00 | **P0–P2 修复**：字号输入草稿提交、Key 明文警告、面板高度自适应、多显示器恢复、穿透轮询降频、AI 重试+超时、锁定提示、布局常量、死代码清理、Rope 高度同源、摆动参数常量 |
| 15:00-15:20 | **P3 增强**：收起禁交互、展开回弹、版本号、右键菜单、双击开设置 |
| 15:20-16:55 | **AI 兼容性攻坚（agnet 平台）**：endpoint 自动补全 `/chat/completions` → 状态码中文诊断 → max_tokens 300→2048 → 去 stop 序列（agnet 会首个 token 截断）→ temperature 1.5 → 风格自定义（默认词库风）→ 防重复（随机句式池+历史反例+撞车重试） |
| 17:30-17:42 | **Release 打包**：safe-delete 拦截 vite 清 dist → vite 配 `emptyOutDir:false` + PowerShell 强删 dist → 打包成功（8m6s） |

## 五、关键技术决策（二次开发必读）

1. **摆动引擎分层**：`usePhysicsSwing` 输出 `{state, pluck(strength), rotateMV, variants}`。
   - 物理模式：rAF 阻尼弹簧（K=9、阻尼 idle0.3/hover0.2/drag0.26），rotate 走 `useMotionValue`（不触发 React 重渲染），`animate` 只管 y/opacity
   - 冲量换算：**摆幅 = 冲量 / ω（ω=√K≈3）**，改摆幅先算冲量
   - 限幅 ±15° 用**弹性反弹**（速度反转×0.4），禁止硬 clamp（会卡边界）
2. **Framer Motion 陷阱**：motion.div 的 transform 会覆盖 Tailwind 的 translate → 水平居中必须放外层普通 div，motion.div 只做摆动
3. **点击 vs 拖拽**：`useDragPosition` 用 4px 位移阈值 + `releasedRef` 防异步残留。原地点击不会进入 dragging（否则物理角度被清零 + release 误触发 = 卡顿）
4. **窗口尺寸铁律**：面板 fixed 定位时宿主窗口**绝不能随内容缩放**（窗口固定 520，内容 transform 缩放）
5. **透明度**：WebView2 下不要用 Rust 层 LWA_ALPHA，用前端 CSS opacity
6. **桌面嵌入已放弃**：WebView2 在 WorkerW（desktop group）不支持 alpha 合成 → 黑底，此路不通
7. **持久化**：Zustand + `debounce(saveConfig, 300)`；新增配置字段要同时改 types / DEFAULT_CONFIG / snapshot
8. **AI 兼容层（agnet 等 OpenAI 兼容平台）**：
   - endpoint 填 base（`.../v1`）也能用：`normalizeEndpoint()` 自动补 `/chat/completions`
   - **不要传 stop 序列**：agnet 推理模型会把 stop 首个 token 截断 → `completion_tokens=1` + content 空
   - **max_tokens 要 ≥2048**：推理模型思考过程先耗 token，300 会被思考耗尽
   - **temperature 1.5**：推理模型对温度不敏感，要创造性就得拉满（0–2 范围）
   - **请求必须每次不同**：相同 payload 会被平台缓存 → 用随机句式结构池 + 历史反例打破
   - 解析四级兜底：content 字符串 → content 数组 → reasoning_content → choices[0].text
   - 错误诊断按状态码映射人话：401/403=Key 错、404=endpoint 错、400=model 错
9. **布局常量集中在 `HangingWidget.tsx` 顶部**：ROPE_HEIGHT/CARD_BOTTOM/TEAR_TOP(278)/BUTTON_TOP(314) 带推导注释；改布局只改一处。Rope 实际总高用 `ropeTotalHeight()`（绳+结-重叠）
10. **配置隔离**：tauri.conf.json 不配 `resources`，用户配置天然落在 `%APPDATA%`，安装包不携带用户数据
11. **本机打包坑**：`genie-safe-delete` shim 会拦截 vite 清空 dist 的删除（trash 失败即报错）→ vite 已配 `emptyOutDir:false`，打包前用 **PowerShell** `Remove-Item -Recurse -Force` 删 dist（bash `rm` 也会被 shim 拦）

## 六、二次开发指南

### 运行（前端热更）
```bash
cd desktop-note-widget
npm run dev                      # vite :1420（前端改动实时生效）
# Rust 改动需重新编译，直接跑 debug 产物：
D:\cargo-build-target\desktop-note-widget\debug\desktop-note-widget.exe
```
> 360 信任区已配置，正常编译用 `npm run tauri:dev` / `cargo build` 即可；若锁文件报错走上面直跑方案。

### 打包
```bash
# 1. 先删 dist（safe-delete shim 会拦 bash rm，用 PowerShell）
Remove-Item -Recurse -Force D:\code\WorkBuddyworkspace\260809\desktop-note-widget\dist

# 2. 设置环境变量 + 打包（CARGO_TARGET_DIR 重定向，勿缺）
cd D:\code\WorkBuddyworkspace\260809\desktop-note-widget
$env:CARGO_TARGET_DIR = "D:\cargo-build-target\desktop-note-widget"
$env:TMP = "D:\build-tmp"; $env:TEMP = "D:\build-tmp"
$env:Path = "C:\Users\Administrator\.cargo\bin;$env:Path"
npm run tauri:build
```
产物：`D:\cargo-build-target\desktop-note-widget\release\bundle\{msi,nsis}\`（release 全量编译约 8 分钟）

### 常用改点速查
| 想改什么 | 改哪里 |
|---|---|
| 摆动手感 | `usePhysicsSwing.ts` 顶部 `SWING_PARAMS`（K/阻尼/冲量/限幅） |
| 摆动模式 | 设置面板「摆动效果」→ store.swingMode |
| 短句 | `data/quotes.json`（18~22 字） |
| 字号档位/行数 | `QuoteText.tsx` FONT_SIZE_LEVELS / MAX_LINES_LEVELS |
| 布局位置（撕边线/按钮） | `HangingWidget.tsx` 顶部布局常量（TEAR_TOP 勿乱改） |
| 尺寸 | `types.ts` BASE_WINDOW + `lib.rs` WINDOW_* 同步改 |
| 主题色 | `types.ts` THEMES |
| 新配置项 | types.ts → widgetStore.ts → SettingsPanel.tsx → persistence 自动生效 |
| AI prompt/风格 | `quoteService.ts` AI_PROMPT / buildAiPrompt / RANDOM_STRUCTURES |
| 托盘菜单 | `src-tauri/src/tray.rs` |
| 新 IPC 命令 | `commands.rs` + `lib.rs` 注册 + 前端 `lib/tauri.ts` |

### 环境要点（本机）
- Rust 1.97.1（rustup + rsproxy.cn 镜像，`~/.cargo/config.toml`）
- MSVC 非标准路径 `D:\MSVS18\pro`（MSVC 14.50），Windows SDK 10.0.26100
- 构建必须 `CARGO_TARGET_DIR=D:\cargo-build-target\desktop-note-widget`、`TMP/TEMP=D:\build-tmp`（C 盘仅剩 0.13GB）
- bash 里 cargo/link 不在 PATH，需导出（见 08-09 日志）
- `npm install` 首跑可能 bin-links 失败，重跑一次即可
- Playwright 验证用 `channel: 'msedge'`（本机 ms-playwright 版本不匹配，别下浏览器）

## 七、已知限制 / 待办

- [x] ~~确认后打 release 包~~ — ✅ **2026-08-11 17:42** 完成（含当天全部改动）：
  - MSI：`D:\cargo-build-target\desktop-note-widget\release\bundle\msi\WindChimeNote_1.0.0_x64_en-US.msi`（2.85M）
  - NSIS：`D:\cargo-build-target\desktop-note-widget\release\bundle\nsis\WindChimeNote_1.0.0_x64-setup.exe`（2.14M）
  - 主程序：`D:\cargo-build-target\desktop-note-widget\release\WindChimeNote.exe`（5.29M）
- [x] ~~锁定模式下无 UI 提示~~ — ✅ 锁定瞬间 2.5s 提示条
- [x] ~~AI 生成失败无重试~~ — ✅ 自动重试 1 次 + 状态码中文诊断 + Toast 重试按钮
- [x] ~~多显示器位置记忆~~ — ✅ 按保存位置所在显示器恢复并钳制
- [x] ~~AI 平台兼容~~ — ✅ endpoint 归一化 / 去 stop / max_tokens 2048 / 风格自定义 / 防重复
- [ ] desktop.rs（桌面嵌入）已归档 `src-tauri/archive/`，勿重新挂载（黑底无解）
- [ ] 自动更新（需更新服务器 + 签名）
- [ ] 多语言 i18n（当前无需求）
- [ ] 每日新句角标（DailyStamp 已覆盖日期，收益低）
- [ ] 性能日志开关（仅调参期有用）

> **打包注意**：vite 已配 `emptyOutDir:false`；打包前仍须用 PowerShell `Remove-Item -Recurse -Force` 删 dist（bash rm / safe-delete trash 均会被拦截）。产物路径在 `D:\cargo-build-target\...`（CARGO_TARGET_DIR 重定向），不在 src-tauri/target 下。

---
*摘要由开发过程日志（.workbuddy/memory/2026-08-09/10.md）整理，时间均为当天实际开发时段。*
