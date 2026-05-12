#!/bin/bash
# ============================================================================
# Follow Builders — Daily Digest Runner (with failure notification)
# ============================================================================
# This script wraps the digest pipeline. If it fails, it pops up a macOS
# dialog asking the user whether to retry.
# ============================================================================

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
SCRIPT_DIR="/Users/monasmacbook/follow-builders/scripts"
LOG="/tmp/follow-builders.log"

run_pipeline() {
  cd "$SCRIPT_DIR" && \
  /opt/homebrew/bin/node prepare-digest.js 2>>"$LOG" | \
  /opt/homebrew/bin/node generate-digest.js 2>>"$LOG" | \
  /opt/homebrew/bin/node deliver.js >>"$LOG" 2>&1
}

# First attempt
run_pipeline
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  # Pipeline failed — show macOS dialog
  RESPONSE=$(osascript -e 'display dialog "☕️ 今天的 AI Builders Digest 生成失败了。\n\n是否要重新生成？" buttons {"不用了", "重新生成"} default button "重新生成" with title "Follow Builders" with icon caution' 2>/dev/null)

  if echo "$RESPONSE" | grep -q "重新生成"; then
    echo "[$(date)] Retrying pipeline..." >> "$LOG"
    run_pipeline
    RETRY_CODE=$?
    if [ $RETRY_CODE -ne 0 ]; then
      osascript -e 'display notification "重试仍然失败，请检查日志: /tmp/follow-builders.log" with title "Follow Builders" subtitle "⚠️ 摘要生成失败"' 2>/dev/null
    fi
  else
    echo "[$(date)] User chose not to retry." >> "$LOG"
  fi
fi
