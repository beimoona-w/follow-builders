#!/bin/bash
# ============================================================================
# Follow Builders — Daily Digest Runner
# ============================================================================
# Invoked by launchd in three ways (see com.followbuilders.digest.plist):
#   1. StartCalendarInterval — daily at the scheduled delivery time
#   2. RunAtLoad             — at login/boot (catch-up if the 10:30 run was missed)
#   3. StartInterval         — every 30 min (catch-up after wake/network recovery)
#
# Guards make every invocation idempotent: it only generates once per day,
# and never before the scheduled delivery time. On failure it retries once
# silently, then asks the user via a macOS dialog (with timeout).
# ============================================================================

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
set -o pipefail

SCRIPT_DIR="/Users/monasmacbook/follow-builders/scripts"
CONFIG="$HOME/.follow-builders/config.json"
LOG="/tmp/follow-builders.log"
NODE="/opt/homebrew/bin/node"

# Delivery time guard (HHMM, no colon). Keep in sync with config.json deliveryTime.
DELIVERY_TIME=1030

# -- Guard 1: never generate before the scheduled delivery time --------------
NOW=$(date +%H%M)
if (( 10#$NOW < DELIVERY_TIME )); then
  exit 0
fi

# -- Guard 2: only generate once per day --------------------------------------
FOLDER=$("$NODE" -p "try{JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).delivery.folder||''}catch(e){''}" 2>/dev/null)
[ -z "$FOLDER" ] && FOLDER="$HOME/Documents/AI_Builders_Digests"
TODAY_FILE="$FOLDER/$(date +%F).html"

if [ -f "$TODAY_FILE" ]; then
  exit 0
fi

# -- Pipeline ------------------------------------------------------------------
run_pipeline() {
  cd "$SCRIPT_DIR" && \
  "$NODE" prepare-digest.js 2>>"$LOG" | \
  "$NODE" generate-digest.js 2>>"$LOG" | \
  "$NODE" deliver.js >>"$LOG" 2>&1
}

echo "[$(date)] Starting digest run..." >> "$LOG"
if run_pipeline; then
  echo "[$(date)] Digest generated successfully." >> "$LOG"
  exit 0
fi

# Silent retry — transient network errors right after wake are common
echo "[$(date)] First attempt failed, retrying in 60s..." >> "$LOG"
sleep 60
if run_pipeline; then
  echo "[$(date)] Retry succeeded." >> "$LOG"
  exit 0
fi

# Both attempts failed — ask the user. "giving up after" prevents the dialog
# from hanging forever when nobody is at the machine. The marker file limits
# the dialog to once per day so interval-triggered catch-ups don't nag.
DIALOG_MARKER="/tmp/follow-builders-dialog-$(date +%F)"
if [ -f "$DIALOG_MARKER" ]; then
  echo "[$(date)] Pipeline failed again; dialog already shown today, staying silent." >> "$LOG"
  exit 1
fi
touch "$DIALOG_MARKER"

RESPONSE=$(osascript -e 'display dialog "☕️ 今天的 AI Builders Digest 生成失败了。\n\n是否要重新生成？" buttons {"不用了", "重新生成"} default button "重新生成" with title "Follow Builders" with icon caution giving up after 300' 2>/dev/null)

if echo "$RESPONSE" | grep -q "重新生成"; then
  echo "[$(date)] User requested retry..." >> "$LOG"
  if ! run_pipeline; then
    osascript -e 'display notification "重试仍然失败，请检查日志: /tmp/follow-builders.log" with title "Follow Builders" subtitle "⚠️ 摘要生成失败"' 2>/dev/null
    echo "[$(date)] Manual retry failed." >> "$LOG"
    exit 1
  fi
  echo "[$(date)] Manual retry succeeded." >> "$LOG"
else
  echo "[$(date)] User dismissed retry dialog (or it timed out). Will catch up on next interval." >> "$LOG"
fi
