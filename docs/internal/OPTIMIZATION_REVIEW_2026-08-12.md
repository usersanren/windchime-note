# 风铃便签 · 代码审核报告（第二轮）

> 审核日期：2026-08-12　|　审核范围：desktop-note-widget 全部前端 + Rust 后端（基于 8-11 修复后的最新代码）
> 方法：逐文件通读（前端 21 文件 + Rust 5 模块 + 配置 3 份）
> 结论：整体质量良好，架构分层清晰；发现 **2 个拖拽系统的真实缺陷（P0）** + 若干优化项。

---

## 一、上轮（8-11）审核项核对

| 上轮项 | 状态 |
|---|---|
| P0-1 字号输入被打断 | ✅ 已修（草稿 + 失焦/回车提交） |
| P0-2 Key 明文存储 | 🟡 部分（设置页已加警告文案；Credential Manager 加密未做，见 P1-1） |
| P1-1 面板高度固定 | ✅ 已修（`max-h-[calc(100vh-130px)]`） |
| P1-2 多显示器位置 | 🟡 **部分**（启动恢复已支持多屏；拖拽侧仍有两处缺陷，见 P0-1 / P0-2） |
| P1-3 穿透轮询降频 | ✅ 已修（窗口隐藏降频 1s） |
| P1-4 AI 失败重试 | ✅ 已修（自动重试 1 次 + 状态码中文诊断 + Toast 重试按钮） |
| P1-5 锁定提示 | ✅ 已修（2.5s 提示条） |
| P2 系列（死代码/布局常量/Rope 高度/摆动参数） | ✅ 全部已修 |
| P3 系列（右键/双击设置/版本号/回弹/收起禁交互） | ✅ 已做 |

---

## 二、新发现问题

### 🔴 P0 — 拖拽系统的两个真实缺陷

#### P0-1 高 DPI 缩放下拖拽位移单位混用，拖拽不跟手
- **位置**：`useDragPosition.ts`
- **问题**：`event.screenX` 是**物理像素**，而 `getWindowPosition()` 返回的 `winPos.x` 是**逻辑坐标**（已除以 scaleFactor，见 `tauri.ts` 第 112-119 行）。拖拽时 `next = startWindowX + delta` 把物理位移直接加到逻辑坐标上。
- **影响**：在 125% / 150% 缩放的显示器上，鼠标拖 100px，卡片实际移动 125 / 150px——**拖拽位移被放大 1.25~1.5 倍，不跟手**；混合缩放多屏时手感混乱。
- **建议**：统一单位。最小改动：`delta` 除以当前 `scale`（逻辑/物理换算）后再参与计算。
- **工作量**：约 20 分钟

#### P0-2 副屏负坐标：左副屏拖不动 + 位置记忆失效
- **位置**：`useDragPosition.ts`（`Math.max(0, …)` 钳制）+ `App.tsx`（`saved >= 0` 判断）
- **问题**：主屏**左侧**的副屏虚拟桌面坐标 `x < 0`。两处没处理负坐标：
  1. 拖拽钳制 `next = Math.min(maxX, Math.max(0, startWindowX + delta))` → 窗口被硬拉回 `x ≥ 0`，**在左副屏根本拖不动**（一动就弹回主屏边缘）
  2. 启动恢复 `saved >= 0 ? monitors.find(...) : undefined` → 保存在负坐标的位置被当成"未初始化"（-1），**重启后丢位置，重新顶部居中**
- **影响**：左侧副屏用户拖拽卡死 + 位置无法持久化。
- **建议**：用独立哨兵（如 `position.x = null` 或加 `hasPosition` 字段）区分"未初始化"与"合法负坐标"；拖拽按**窗口所在显示器**钳制：`min = base.x`、`max = base.x + base.width - winWidth`（允许负值）。
- **工作量**：1–2 小时

### 🟠 P1 — 建议优先

#### P1-1 AI Key 明文存储（上轮遗留的完整方案）
- **位置**：`persistence.ts` → `widget-config.json`
- **现状**：仅加提示文案；Key 仍明文落盘 `%APPDATA%`。
- **建议**：接 Windows Credential Manager（新增 Rust 命令读写凭据，本地只存引用）。
- **工作量**：2–4 小时

#### P1-2 AI 生成 loading 期间按钮未禁用，可并发请求
- **位置**：`ControlButtons.tsx`（`aiLoading` 时只换 spinner，`onClick` 仍绑定 `onAiRefresh`）
- **问题**：loading 期间连点可并发发起多个 AI 请求（Rust 侧无节流），浪费额度。
- **建议**：`aiLoading` 时按钮 `disabled`（或 `onClick` 置空）。
- **工作量**：10 分钟

#### P1-3 托盘锁定与前端锁定的生效时机不一致
- **位置**：`tray.rs::toggle_lock` vs `commands.rs::set_locked`
- **问题**：两处逻辑重复（set_locked + sync_menu + emit），但 `set_locked` 命令会**立即** `set_ignore_cursor_events`，托盘路径只依赖 40ms 轮询线程（最多 40ms 延迟）。行为不完全一致，后续维护易漂移。
- **建议**：抽公共函数（如 `passthrough::apply_locked(app, state, locked)`），两处共用，统一立即生效。
- **工作量**：30 分钟

### 🟡 P2 — 代码质量与维护性

| # | 项 | 说明 | 建议 |
|---|---|---|---|
| P2-1 | `types.ts` `QuoteMode` 死类型 | `'random'/'manual'/'daily'` 全项目无引用 | 删除 |
| P2-2 | 锁定模式下穿透轮询仍查光标 | `passthrough.rs`：locked=true 时 `should_ignore` 恒 true，光标查询/坐标换算全白做 | 锁定分支直接 `set_ignore_cursor_events(true)` 一次后跳过查询 |
| P2-3 | `generate_ai_quote` 无 endpoint 校验 | endpoint 由用户填写，Rust 直连任意 URL（自用场景低风险） | 至少校验 scheme 为 http/https；可选加 SSRF 防护（禁内网段） |
| P2-4 | 锁定逻辑重复 | `tray.rs` 与 `commands.rs` 各写一份 | 随 P1-3 一并收敛 |
| P2-5 | `mergeConfig` 不做字段类型校验 | 配置被手改坏（如 opacity 变字符串）会透传 | 对数值字段加 `typeof === 'number'` 兜底 |

### 🟢 P3 — 体验与可选增强

| # | 项 | 说明 | 建议 |
|---|---|---|---|
| P3-1 | AI 设置无「测试连接」 | 填完端点/Key 只能靠点 AI 按钮验证 | 设置页加测试按钮（调一次最简请求） |
| P3-2 | 摆动模式切换瞬间角度跳变 | classic→physics 时 `rotateMV` 保留旧角度 | 切换时把 rotateMV 重置为 0 |
| P3-3 | 每日更新无角标反馈 | 跨天换句无视觉提示 | 复用 DailyStamp 加"今日"角标（已知待办） |
| P3-4 | 自动更新 / i18n | 已知待办 | 需更新服务器 + 签名；当前单用户可暂缓 |

---

## 三、值得保留的亮点

- **日期统一**：`lib/date.ts` 单一日期来源，杜绝 UTC/本地混用（本次修复成果）
- **事件驱动印章**：无常驻轮询，lastUpdateDate + focus + 10min 兜底（本次优化成果）
- **布局常量集中**：`HangingWidget` 顶部推导注释完整，Rope 高度同源
- **权限最小化**：capabilities 逐项授权；CSP 收紧 `connect-src`
- **健壮性**：`safe()` 包装所有系统调用、浏览器降级、`mergeConfig` 兜底新增字段
- **AI 兼容层**：endpoint 归一化 / 去 stop / max_tokens 2048 / 四级解析 / 状态码中文诊断，做工扎实

---

## 四、建议优先级

**拖拽修复包（约 2 小时）**：P0-1 单位统一 + P0-2 负坐标钳制与位置哨兵 —— 多屏/高 DPI 用户的体验刚需
**体验小包（40 分钟）**：P1-2 AI 按钮禁用 + P3-2 摆动切换角度重置
**工程包（1 天）**：P1-3/P2-4 锁定逻辑收敛 + P2-1 死代码 + P2-2 锁定轮询优化
**可选长线**：P1-1 Credential Manager、P2-3 endpoint 校验、P3-1 测试连接

---

*审核基于逐文件阅读；未运行编译（本机安全软件拦截，编译命令见 DEVELOPMENT_SUMMARY.md）。*
