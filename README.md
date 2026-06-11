# Follow Builders · Editorial Briefing Edition

> 🧠 每天 30 秒，掌握全球顶尖 AI Builder 的最新动态。
>
> 基于 [follow-builders](https://github.com/zarazhangrui/follow-builders) 深度定制，保留原版全部能力，阅读体验全面升级。

---

## ✨ 这是什么？

一个 **全自动、本地运行** 的 AI 情报推送系统。

它每天自动从 Twitter / X、播客、博客等渠道抓取全球顶尖 AI 建造者（Sam Altman、Andrej Karpathy、Swyx 等）的最新动态，通过 Claude AI 生成中英双语摘要，然后以一份排版精良的 **杂志式情报简报** 网页呈现在你面前，并自动归档每一期。

**你不需要刷推特，不需要翻墙，不需要任何操作 —— 每天 10:30，浏览器自动弹出今日情报。**

---

## 🎨 界面预览

| 功能 | 说明 |
|------|------|
| 📰 **杂志式排版** | Fraunces 衬线报头 + 编号速览目录，宽屏下速览固定为左侧导航栏 |
| 🃏 **卡片式信息流** | 每位 Builder / 播客 / 博客一张卡片，中英文摘要同卡呈现 |
| 🌐 **双语切换** | 右上角 EN / 双语 / 中 三档切换，偏好自动记忆 |
| 🔗 **链接胶囊** | 原文链接收纳为卡片底部的紧凑胶囊（Tweet / YouTube…），自动去重 |
| ⚡ **今日速览** | Top 5 双语摘要 + 滚动定位高亮，点击跳转对应卡片 |
| 📚 **往期归档** | 每日自动存档 + 自动生成归档索引页，右上角「归档」直达 |
| 🏷️ **AI 关键词高亮** | 自动识别 30+ AI 术语（Claude、LLM、Agent…） |
| 🌙 **暗色模式** | 默认跟随系统，可手动切换并记忆 |
| 📴 **离线可读** | marked.js 内联进页面，归档文件断网也能永久打开 |

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
git clone https://github.com/beimoona-w/follow-builders.git
cd follow-builders
```

> 脚本零依赖，无需 `npm install`。

### 第三步：配置 Claude CLI

本项目依赖 Claude Code CLI 来生成摘要。请参考 [Claude Code 官方文档](https://docs.anthropic.com/en/docs/claude-code) 完成安装和登录（终端运行 `claude` 能进入对话即为就绪）。

### 第四步：设置配置文件

```bash
# 创建配置目录
mkdir -p ~/.follow-builders

# 创建配置文件（$HOME 会自动替换成你自己的家目录，无需手动修改）
cat > ~/.follow-builders/config.json << EOF
{
  "delivery": {
    "method": "local_html",
    "folder": "$HOME/Documents/AI_Builders_Digests"
  }
}
EOF
```

### 第五步：手动测试一次

```bash
cd ~/follow-builders/scripts

# 先跑冒烟测试（不调用 Claude，几秒出结果，验证环境没问题）
npm test

# 再完整生成一次今天的摘要
node prepare-digest.js | node generate-digest.js | node deliver.js
```

如果一切正常，浏览器会自动弹出一个精美的摘要页面 🎉

### 第六步：设置每日自动执行

运行一键安装脚本，它会为你这台电脑自动生成正确路径并加载定时任务（重复运行也安全）：

```bash
bash ~/follow-builders/scripts/install_schedule.sh
```

**搞定！从明天起，每天 10:30 你的浏览器会自动弹出最新一期 AI 情报。**

> 💡 **错过了 10:30 也没关系。** 定时任务包含补跑机制（开机时 + 每 30 分钟检查一次）：
> 只要当天还没生成过摘要、且已过 10:30，打开电脑后会自动补上当天的摘要。
> 每天只会生成一次，不会重复弹出。

---

## 🆚 相比原版好在哪？

| | 原版 | 本定制版 |
|---|---|---|
| **阅读体验** | 纯文本 / Telegram 消息 | 杂志式简报排版 + 双语切换 |
| **往期归档** | 不保存 | ✅ 每日存档 + 归档索引页 |
| **内容导航** | 无 | 今日速览 Top 5 + 锚点跳转 |
| **关键词识别** | 无 | 30+ AI 术语自动高亮 |
| **暗色模式** | 无 | ✅ 一键切换，偏好记忆 |
| **失败处理** | 静默失败 | 自动重试 + macOS 弹窗提醒 |
| **错过定时** | 当天摘要丢失 | ✅ 开机自动补跑，绝不漏一期 |
| **原文链接** | 大段裸链接刷屏 | ✅ 卡片底部紧凑链接胶囊 |
| **返回顶部** | 无 | ✅ 浮动按钮，平滑滚动 |
| **阅读进度** | 无 | ✅ 顶部渐变进度条 |
| **信息源更新** | ✅ 云端自动同步 | ✅ **完整保留** |

---

## 📂 文件结构

```
~/follow-builders/scripts/
├── prepare-digest.js      # 从云端拉取最新信息源
├── generate-digest.js     # 调用 Claude AI 生成双语摘要
├── deliver.js             # ⭐ 定制版交付脚本（SaaS UI + 链接胶囊）
├── run_digest.sh          # ⭐ 执行包装（幂等守卫+自动重试+失败弹窗）
├── install_schedule.sh    # ⭐ 定时任务一键安装（自动适配本机路径）
├── smoke-test.js          # ⭐ 冒烟测试（npm test）
└── com.followbuilders.digest.plist  # ⭐ launchd 任务模板（含补跑机制）

~/.follow-builders/
├── config.json            # 推送配置
└── cache/marked.min.js    # 自动缓存的渲染库（离线能力）

~/Documents/AI_Builders_Digests/
├── index.html             # ⭐ 归档索引页（每次生成后自动刷新）
├── 2026-06-10.html        # 每日摘要归档
├── 2026-06-11.html
└── ...
```

---

## ⚙️ 推送方式

本项目为**纯网页版**：每天生成一个独立 HTML 存入归档文件夹并自动打开浏览器，同时刷新归档索引页（`index.html`）。

在 `~/.follow-builders/config.json` 中可调整：

| 配置 | 说明 |
|------|------|
| `delivery.method` | `local_html`（默认，网页版）或 `stdout`（打印到终端） |
| `delivery.folder` | 归档文件夹位置，默认 `~/Documents/AI_Builders_Digests` |

---

## 🔧 常用命令

```bash
# 手动生成今天的摘要
cd ~/follow-builders/scripts
node prepare-digest.js | node generate-digest.js | node deliver.js

# 改完代码后跑冒烟测试（验证页面关键功能没被改坏）
cd ~/follow-builders/scripts && npm test

# 查看运行日志
cat /tmp/follow-builders.log

# 重新安装/重新加载定时任务
bash ~/follow-builders/scripts/install_schedule.sh
```

---

## 💡 FAQ

**Q: 信息源是谁维护的？**
A: 原项目作者在云端统一维护。你的本地版本**每次执行时实时同步**最新名单和最新提示词——上游加了新人选或优化了摘要风格，第二天自动生效，无需任何操作。仅当网络不可用时才回退到本地副本。

**Q: 往期摘要在哪里看？**
A: 页面右上角点「归档」，或直接打开归档文件夹里的 `index.html`，所有往期按日期倒序排列。

**Q: 生成失败了怎么办？**
A: 脚本会先自动重试一次；仍失败时 macOS 会弹出对话框问你是否重试（每天最多打扰一次）。之后每 30 分钟还会自动补跑，直到当天摘要生成成功。你也可以手动在终端执行上面的命令。

**Q: 10:30 没开电脑，摘要会丢吗？**
A: 不会。只要当天任意时间打开电脑，补跑机制会立即生成当天的摘要。

**Q: 可以修改执行时间吗？**
A: 改两处：`scripts/com.followbuilders.digest.plist` 模板中的 `Hour`/`Minute`，以及 `scripts/run_digest.sh` 中的 `DELIVERY_TIME`（补跑机制的时间下限），然后重新运行 `bash scripts/install_schedule.sh`。

**Q: 摘要保存在哪？**
A: `~/Documents/AI_Builders_Digests/` 目录下，按日期命名。

---

<p align="center">
  <sub>Built with ❤️ by enhancing <a href="https://github.com/zarazhangrui/follow-builders">follow-builders</a></sub>
</p>
