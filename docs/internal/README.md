# Internal Development Notes (内部开发记录)

> ⚠️ **本目录内容仅供项目维护者参考**，是开发过程中的**内部工作记录**，不是给用户的文档。

以下文档包含**本机开发环境信息**（如自定义 `CARGO_TARGET_DIR`、安全软件、镜像源等），与公开的 README / 用户文档不同，**不适用于普通使用者**：

| 文件 | 内容 |
|---|---|
| `DEVELOPMENT_SUMMARY.md` | 完整开发时间线、技术决策、打包流程（含本机路径示例） |
| `OPTIMIZATION_REVIEW.md` | 首轮代码审查发现与修复 |
| `OPTIMIZATION_REVIEW_2026-08-12.md` | 第二轮代码审查（拖拽/DPI/锁定） |

**如果你是使用者**：请直接看根目录的 [README](../../README.md)，无需阅读本目录。

**如果你是贡献者**：本文档中的路径（`D:\cargo-build-target` 等）是原作者本机环境，**请替换为你自己的路径**；环境变量 `CARGO_TARGET_DIR` / `TMP` / `TEMP` 只是构建加速/磁盘空间重定向手段，非必需。
