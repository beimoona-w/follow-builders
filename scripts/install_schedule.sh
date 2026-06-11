#!/bin/bash
# ============================================================================
# Follow Builders — Install the daily launchd schedule (macOS)
# ============================================================================
# Generates the launchd plist for THIS machine (no hardcoded usernames or
# paths) and loads it. Safe to re-run: it replaces any existing schedule.
#
# Usage: bash scripts/install_schedule.sh
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/com.followbuilders.digest.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.followbuilders.digest.plist"
LABEL="com.followbuilders.digest"

mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__RUN_DIGEST_PATH__|$SCRIPT_DIR/run_digest.sh|" "$TEMPLATE" > "$PLIST_DST"
plutil -lint "$PLIST_DST" > /dev/null

# Reload: remove the old job if present, then load the new one
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"

echo "✅ 定时任务已安装：每天 10:30 自动生成摘要"
echo "   （开机补跑 + 每 30 分钟自动检查，错过时间也不会漏）"
echo "   日志：/tmp/follow-builders.log"
