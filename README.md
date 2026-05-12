# Follow Builders · SaaS Digest UI Edition

> 🧠 每天 30 秒，掌握全球顶尖 AI Builder 的最新动态。
>
> 基于 [follow-builders](https://github.com/zarazhangrui/follow-builders) 深度定制，保留原版全部能力，阅读体验全面升级。

---

## ✨ 这是什么？

一个 **全自动、本地运行** 的 AI 情报推送系统。

它每天自动从 Twitter / X、播客、博客等渠道抓取全球顶尖 AI 建造者（Sam Altman、Andrej Karpathy、Swyx 等）的最新动态，通过 Claude AI 生成中英双语摘要，然后以一个精美的 **SaaS 级仪表盘** 页面呈现在你面前。

**你不需要刷推特，不需要翻墙，不需要任何操作 —— 每天 10:30，浏览器自动弹出今日情报。**

---

## 🎨 界面预览

| 功能 | 说明 |
|------|------|
| 🃏 **卡片式信息流** | 每位 Builder 的动态独占一张白色圆角卡片，配有彩色哈希头像 |
| ⚡ **今日速览** | 顶部 Top 5 双语摘要，点击直接跳转到对应卡片 |
| 🏷️ **AI 关键词高亮** | 自动识别 30+ AI 术语（Claude、LLM、Agent…），紫色标签一目了然 |
| 🌙 **暗色模式** | 一键切换，偏好自动记忆 |
| ⬆️ **返回顶部** | 右下角浮动按钮，滚动后淡入，风格与高亮标签统一 |
| 📊 **阅读进度条** | 顶部渐变色进度条，实时反馈阅读位置 |

---

## 🚀 从零开始安装（完全小白版）

### 第一步：安装基础工具

打开 Mac 的 **终端**（在启动台搜索"终端"或"Terminal"）：

```bash
# 安装 Homebrew（Mac 的软件包管理器）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Node.js（运行脚本的引擎）
brew install node
```

### 第二步：下载项目

```bash
cd ~
git clone https://github.com/zarazhangrui/follow-builders.git
cd follow-builders
npm install
```

### 第三步：配置 Claude CLI

本项目依赖 Claude CLI 来生成摘要。请参考 [Claude CLI 官方文档](https://docs.anthropic.com/en/docs/claude-cli) 完成安装和登录。

### 第四步：设置配置文件

```bash
# 创建配置目录
mkdir -p ~/.follow-builders

# 创建配置文件
cat > ~/.follow-builders/config.json << 'EOF'
{
  "delivery": {
    "method": "local_html",
    "folder": "/Users/你的用户名/Documents/AI_Builders_Digests"
  }
}
EOF
```

> ⚠️ 把 `你的用户名` 换成你的 Mac 用户名（终端输入 `whoami` 可以查看）

### 第五步：手动测试一次

```bash
cd ~/follow-builders/scripts
node prepare-digest.js | node generate-digest.js | node deliver.js
```

如果一切正常，浏览器会自动弹出一个精美的摘要页面 🎉

### 第六步：设置每日自动执行

```bash
cat > ~/Library/LaunchAgents/com.followbuilders.digest.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.followbuilders.digest</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>~/follow-builders/scripts/run_digest.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>10</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/follow-builders.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/follow-builders.log</string>
</dict>
</plist>
EOF

# 激活定时任务
launchctl load ~/Library/LaunchAgents/com.followbuilders.digest.plist
```

**搞定！从明天起，每天 10:30 你的浏览器会自动弹出最新一期 AI 情报。**

---

## 🆚 相比原版好在哪？

| | 原版 | 本定制版 |
|---|---|---|
| **阅读体验** | 纯文本 / Telegram 消息 | SaaS 级卡片 UI，Inter 字体 |
| **内容导航** | 无 | 今日速览 Top 5 + 锚点跳转 |
| **关键词识别** | 无 | 30+ AI 术语自动高亮 |
| **暗色模式** | 无 | ✅ 一键切换，偏好记忆 |
| **本地存储** | 不保存 | 每日自动归档为 HTML 文件 |
| **失败处理** | 静默失败 | macOS 弹窗提醒 + 一键重试 |
| **返回顶部** | 无 | ✅ 浮动按钮，平滑滚动 |
| **阅读进度** | 无 | ✅ 顶部渐变进度条 |
| **信息源更新** | ✅ 云端自动同步 | ✅ **完整保留** |

---

## 📂 文件结构

```
~/follow-builders/scripts/
├── prepare-digest.js      # 从云端拉取最新信息源
├── generate-digest.js     # 调用 Claude AI 生成双语摘要
├── deliver.js             # ⭐ 定制版交付脚本（SaaS UI）
└── run_digest.sh          # ⭐ 执行包装（失败弹窗+重试）

~/.follow-builders/
├── config.json            # 推送方式配置
└── .env                   # API 密钥（可选）

~/Documents/AI_Builders_Digests/
├── 2026-05-07.html        # 每日摘要归档
├── 2026-05-08.html
└── ...
```

---

## ⚙️ 支持的推送方式

在 `~/.follow-builders/config.json` 中修改 `delivery.method`：

| 方式 | 值 | 说明 |
|------|-----|------|
| 本地网页（推荐） | `local_html` | 生成 HTML 并自动弹出浏览器 |
| Telegram | `telegram` | 通过 Bot 推送到指定聊天 |
| Email | `email` | 通过 Resend API 发送邮件 |
| 终端输出 | `stdout` | 直接打印到命令行 |

---

## 🔧 常用命令

```bash
# 手动生成今天的摘要
cd ~/follow-builders/scripts
node prepare-digest.js | node generate-digest.js | node deliver.js

# 查看运行日志
cat /tmp/follow-builders.log

# 重新加载定时任务
launchctl unload ~/Library/LaunchAgents/com.followbuilders.digest.plist
launchctl load ~/Library/LaunchAgents/com.followbuilders.digest.plist
```

---

## 💡 FAQ

**Q: 信息源是谁维护的？**
A: 原项目作者在云端统一维护。你的本地版本每次执行时自动同步最新名单，无需手动操作。

**Q: 生成失败了怎么办？**
A: 如果定时任务执行失败，macOS 会弹出对话框问你是否重试。你也可以手动在终端执行上面的命令。

**Q: 可以修改执行时间吗？**
A: 编辑 `~/Library/LaunchAgents/com.followbuilders.digest.plist` 中的 `Hour` 和 `Minute` 值，然后重新加载。

**Q: 摘要保存在哪？**
A: `~/Documents/AI_Builders_Digests/` 目录下，按日期命名。

---

<p align="center">
  <sub>Built with ❤️ by enhancing <a href="https://github.com/zarazhangrui/follow-builders">follow-builders</a></sub>
</p>
