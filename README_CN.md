<p align="center">
  <h1 align="center">⚡️ PowerClip</h1>
</p>

<p align="center">
  <strong>现代化、注重隐私的剪贴板管理器，支持 AI 智能搜索</strong>
</p>

<p align="center">
  <a href="README.md">English</a> •
  <a href="#功能特性">功能</a> •
  <a href="#安装">安装</a> •
  <a href="#快捷键">快捷键</a> •
  <a href="#配置">配置</a> •
  <a href="#开发">开发</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/Rust-1.70+-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/License-Apache2.0-green?style=flat-square" alt="License">
</p>

<div align="center">
<img src="image/screen_shot.png" width=50% />
</div>

<br/>

## 📖 简介

**PowerClip** 是一款轻量、快速且注重隐私的剪贴板历史管理器，支持 AI 驱动的语义搜索功能。

基于 **Rust** 后端的高性能和 **Tauri 2.0** 轻量架构，PowerClip 提供流畅的使用体验，同时消耗最少的系统资源。所有数据均存储在本地 SQLite 数据库中，确保你的剪贴板历史保持私密且完全由你掌控。

## ✨ 功能特性

### 核心功能

- ⚡️ **极速响应** - Rust 驱动，毫秒级启动和搜索
- 🔒 **隐私安全** - 数据本地存储于 SQLite，无需网络上传
- 📋 **多类型支持** - 追踪文本、图片和文件引用
- 🖥 **系统集成** - 原生系统托盘支持和窗口体验
- ⌨️ **键盘优先** - 全键盘导航，支持自定义全局快捷键
- 🎨 **现代界面** - Apple HIG 风格设计，流畅动画

### 智能功能

- 🔍 **AI 语义搜索** - 使用自然语言查询剪贴板内容（支持 OpenAI 兼容的嵌入 API）
- ⭐ **快捷命令** - 保存常用文本片段，支持自定义别名快速访问
- 🏷️ **智能列表** - 按类型（文本/图片/文件）或时间（今天/本周）筛选历史
- 🔌 **扩展系统** - 对剪贴板内容运行 Shell 命令管道
- 📌 **自动粘贴** - 选择后可选自动粘贴内容

### 高级功能

- ⚙️ **热重载配置** - 无需重启即可更改设置
- 🪟 **可调整大小** - 记住窗口位置和大小
- 🌙 **透明窗口** - 可调节窗口透明度，无缝桌面集成

## 📥 安装

从 [Releases](https://github.com/Skyminers/PowerClip/releases) 页面下载最新版本：

- **macOS**: 下载 `.dmg` 文件
- **Windows**: 下载 `.msi` 或 `.exe` 安装程序

## ⌨️ 快捷键

### 全局快捷键

| 操作 | macOS | Windows |
| :--- | :--- | :--- |
| 显示/隐藏窗口 | `Cmd` + `Shift` + `V` | `Ctrl` + `Shift` + `V` |
| 添加剪贴板到快捷命令 | `Cmd` + `Shift` + `S` | `Ctrl` + `Shift` + `S` |

> 所有快捷键均可在配置文件中自定义。

### 窗口内导航

| 按键 | 操作 |
| :--- | :--- |
| `↑` / `↓` | 浏览历史记录 |
| `←` / `→` | 切换筛选标签（历史）/ 切换视图 |
| `Enter` | 复制选中项（如启用则自动粘贴） |
| `Tab` | 打开扩展选择器（对选中项） |
| `/` | 聚焦搜索框 |
| `Esc` | 关闭窗口 |
| `Cmd/Ctrl` + `P` | 切换历史和快捷命令 |
| `Cmd/Ctrl` + `,` | 在编辑器中打开配置文件 |

## 🔧 配置

PowerClip 使用 JSON 配置文件管理所有设置。按 `Cmd/Ctrl` + `,` 在默认编辑器中打开。

### 配置文件位置

- **macOS**: `~/Library/Application Support/PowerClip/settings.json`
- **Windows**: `%APPDATA%/PowerClip/settings.json`

### 配置示例

```json
{
  "auto_cleanup_enabled": false,
  "max_items": 100,
  "hotkey_modifiers": "Meta+Shift",
  "hotkey_key": "KeyV",
  "window_opacity": 0.95,
  "auto_paste_enabled": false,
  "semantic_search_enabled": false,
  "embedding_api_url": "https://api.openai.com/v1",
  "embedding_api_key": "sk-...",
  "embedding_api_model": "text-embedding-3-small",
  "embedding_api_dim": 256,
  "add_to_snippets_hotkey_enabled": true,
  "add_to_snippets_hotkey_modifiers": "Meta+Shift",
  "add_to_snippets_hotkey_key": "KeyS",
  "extensions": [
    {
      "name": "转大写",
      "command": "tr '[:lower:]' '[:upper:]'",
      "timeout": 5000,
      "close_on_success": true
    }
  ]
}
```

### 主要设置项

| 设置 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `max_items` | 最大历史记录数 | `100` |
| `auto_paste_enabled` | 选择后自动粘贴 | `false` |
| `semantic_search_enabled` | 启用 AI 搜索 | `false` |
| `embedding_api_url` | OpenAI 兼容 API 地址 | - |
| `embedding_api_key` | 嵌入服务 API 密钥 | - |
| `extensions` | Shell 命令扩展列表 | `[]` |

## 🤖 AI 语义搜索

PowerClip 通过嵌入 API 支持自然语言搜索。启用方法：

1. 在配置中设置 `semantic_search_enabled` 为 `true`
2. 配置你的嵌入 API 凭据：
   - `embedding_api_url`: 任意 OpenAI 兼容端点
   - `embedding_api_key`: 你的 API 密钥
   - `embedding_api_model`: 模型名称（如 `text-embedding-3-small`）
   - `embedding_api_dim`: 嵌入维度（通常为 256-1536）

3. 保存配置文件 - 索引将自动开始

兼容 OpenAI、Azure OpenAI 以及任何 OpenAI 兼容的嵌入服务。

## 🔌 扩展系统

扩展允许你通过 Shell 命令处理剪贴板内容。选中项目后按 `Tab`，可以选择要运行的扩展。

### 扩展配置

```json
{
  "extensions": [
    {
      "name": "JSON 格式化",
      "command": "python3 -m json.tool",
      "timeout": 5000,
      "close_on_success": true
    },
    {
      "name": "Base64 编码",
      "command": "base64",
      "timeout": 3000,
      "close_on_success": false
    }
  ]
}
```

- **name**: 扩展选择器中显示的名称
- **command**: 要运行的 Shell 命令（剪贴板内容通过 stdin 传入）
- **timeout**: 最大执行时间（毫秒）
- **close_on_success**: 成功执行后是否关闭窗口

## 🛠 技术栈

PowerClip 采用现代跨平台技术构建：

| 层级 | 技术 |
| :--- | :--- |
| **核心** | [Rust](https://www.rust-lang.org/) & [Tauri 2.0](https://v2.tauri.app/) |
| **前端** | [React 18](https://react.dev/) + TypeScript |
| **样式** | [Tailwind CSS](https://tailwindcss.com/) |
| **数据库** | SQLite（内置，本地存储） |
| **构建** | [Bun](https://bun.sh/) |

## 💻 开发

### 环境要求

- **操作系统**: macOS 10.15+ 或 Windows 10+
- **Rust**: 1.70+（通过 [rustup](https://rustup.rs/) 安装）
- **Bun**: 推荐 1.0+（通过 [bun.sh](https://bun.sh) 安装）

### 快速开始

1. **克隆仓库**

```bash
git clone https://github.com/Skyminers/PowerClip.git
cd PowerClip
```

2. **安装依赖**

```bash
cd frontend
bun install
cd ..
```

3. **运行开发模式**

```bash
bun tauri dev
```

这将同时启动前端开发服务器和带热重载的 Tauri 窗口。

### 构建发布版本

```bash
bun tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

### 项目结构

```
PowerClip/
├── src-tauri/           # Rust 后端
│   ├── src/
│   │   ├── main.rs      # 应用入口
│   │   ├── commands/    # Tauri 命令处理
│   │   ├── db/          # 数据库操作
│   │   ├── semantic/    # AI 搜索实现
│   │   ├── clipboard/   # 剪贴板监控
│   │   ├── hotkey/      # 全局快捷键
│   │   └── window/      # 窗口管理
│   └── tauri.conf.json  # Tauri 配置
├── frontend/            # React 前端
│   ├── src/
│   │   ├── components/  # UI 组件
│   │   ├── hooks/       # React hooks
│   │   ├── utils/       # 工具函数
│   │   └── App.tsx      # 主应用
│   └── package.json
└── README.md
```

## 📄 许可证

本项目采用 Apache License 2.0 开源许可。

---

<p align="center">Made with ❤️ by Sky_miner</p>
