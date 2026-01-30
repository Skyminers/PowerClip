# PowerClip

一个现代化的剪贴板历史管理器，使用 Rust + Tauri 2.0 + React + Tailwind CSS 构建。

## 技术栈

- **后端**: Rust + Tauri 2.0
- **前端**: React + TypeScript + Tailwind CSS
- **数据库**: SQLite (bundled)
- **剪贴板监控**: 系统原生命令 (pbpaste/xclip/Get-Clipboard)

## 功能

- 自动记录剪贴板历史
- 支持纯文本
- 系统托盘集成
- 全局快捷键显示/隐藏
- 键盘导航和复制

## 快捷键

| 系统 | 快捷键 |
|------|--------|
| macOS | `Cmd + Shift + V` |
| Windows | `Ctrl + Shift + V` |
| Linux | `Ctrl + Shift + V` |

其他快捷键：
- `Enter` - 复制选中项
- `↑/↓` - 导航
- `Esc` - 关闭窗口

## 运行方式

### 开发模式

```bash
# 安装依赖（只需一次）
cd src-tauri
cargo fetch

# 启动开发服务器（会自动启动前端 + 后端）
cargo tauri dev
```

### 构建发布版

```bash
cd src-tauri
cargo build --release
```

## 系统要求

- macOS 10.15+ / Windows 10+ / Linux
- Rust 1.70+
- Bun 1.0+
