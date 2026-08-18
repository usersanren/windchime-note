# 风铃便签 · WindChimeNote

一枚从 Windows 桌面顶部垂下的手绘风便签小组件。绳子牵着一张米白纸卡随风轻摆，每天送你一句二十字励志短句。

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Tauri v2（Rust） |
| 前端 | React 18 + TypeScript 5（strict） + Vite 5 |
| 样式 | Tailwind CSS 3 + 自定义 CSS |
| 状态 | Zustand 5 |
| 动画 | Framer Motion 11 |
| 持久化 | Tauri Store Plugin（浏览器下降级 localStorage） |

## 快速开始

```bash
npm install

# 纯前端预览（浏览器，Tauri API 自动降级为空实现）
npm run dev

# 桌面开发模式
npm run tauri:dev

# 打包 .msi + .exe 安装包
npm run tauri:build
```

产物位于 `src-tauri/target/release/bundle/`（`msi/` 与 `nsis/`）。

### 环境要求

- Node.js ≥ 18
- Rust stable（`rustup`）
- Visual Studio Build Tools：「使用 C++ 的桌面开发」工作负载（含 MSVC v143 + Windows SDK）
- WebView2 Runtime（Win11 自带；安装器会按需引导下载）

## 交互速查

| 操作 | 效果 |
|---|---|
| 悬停卡片 | 摆动幅度加大，控制按钮淡入 |
| 拖拽卡片 | 仅水平移动窗口，松手弹簧回正，位置自动持久化 |
| 刷新按钮 | 卡片 Y 轴翻转，中点换句 |
| 齿轮按钮 | 右侧滑出设置抽屉 |
| 关闭按钮 | 隐藏到系统托盘 |
| `Ctrl + Shift + Q` | 全局显示 / 隐藏 |
| 托盘左键 | 切换显隐 |
| 托盘右键 | 显示 / 隐藏 / 退出 |

卡片区域之外的桌面点击会直接穿透，不会挡住桌面图标。

## 设置项

- **透明度** 30% – 100%（Windows 分层窗口，真·整窗透明）
- **大小** 0.6× / 0.8× / 1.0× / 1.2×（CSS scale 与窗口实际尺寸同步）
- **主题** 暖黄 / 淡粉 / 浅绿 / 牛皮纸
- **每日更新** 每天 00:00 自动换句；关闭后仅手动切换
- **开机自启** 由 Tauri Autostart 插件托管
- **自定义句子** 追加到独立池，与预置 100 条并存
- **在线生成（可选）** 填入 OpenAI 兼容端点即可让 AI 现写一句；留空则完全离线

## 目录结构

```
src/
├── components/       # Rope / NoteCard / QuoteText / DailyStamp / ControlButtons
│   └── settings/     # 设置抽屉的原子控件与分区
├── hooks/            # 摆动物理 / 拖拽 / 句子管理 / 每日更新 / 鼠标穿透
├── stores/           # Zustand + 持久化
├── services/         # 句子选取与可选 AI 调用
├── lib/              # Tauri 适配层（浏览器自动降级）、Store 读写
├── data/quotes.json  # 100 条 18–22 字短句
└── styles/           # 纸张纹理、关键帧动画
src-tauri/
├── src/lib.rs        # 窗口构建 / 插件注册 / 全局快捷键
├── src/tray.rs       # 系统托盘
├── src/passthrough.rs# 鼠标穿透轮询
├── src/platform.rs   # Windows 分层窗口透明度、全局光标
└── src/commands.rs   # 暴露给前端的命令
```

## 设计说明

**鼠标穿透**：Tauri 只能整窗开关鼠标事件。前端周期性把可交互元素的包围盒上报给 Rust，后台线程以 40ms 轮询全局光标位置，跨过边界时才切换 `set_ignore_cursor_events`，避免高频系统调用。拖拽期间锁定为整窗可交互，防止鼠标甩出卡片导致拖拽中断。

**窗口透明度**：Tauri v2 没有跨平台 `setOpacity`，Windows 侧通过 `WS_EX_LAYERED` + `SetLayeredWindowAttributes` 实现整窗 alpha。

**环境适配**：所有系统调用收敛在 `src/lib/tauri.ts`，非 Tauri 环境返回安全默认值，因此 `npm run dev` 在浏览器里也能完整调试视觉与交互。

## 卸载

NSIS 安装器带 `POSTUNINSTALL` 钩子，卸载时清除 `%APPDATA%` / `%LOCALAPPDATA%` 下的配置与 WebView 缓存，并移除开机自启注册项。
