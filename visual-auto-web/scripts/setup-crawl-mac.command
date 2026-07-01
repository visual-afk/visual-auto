#!/bin/zsh
#
# 비주얼살롱 HandSOS 자동 수집 — 예진매니저 맥 설치 프로그램
# 이 파일을 더블클릭하면 (또는 터미널에서 실행하면) 아래를 자동 설치합니다.
#   1) 매일 08:30 자동 수집 (launchd)
#   2) 바탕화면 "지금 수집" 버튼 (더블클릭하면 즉시 수집)
#
# 필요: 이 맥이 한국 인터넷(가정용/매장용)에 연결돼 있어야 함. node 설치돼 있어야 함.
# 처음 1회만 실행하면 됩니다.

set -e
emulate -L zsh

echo "======================================================"
echo "  비주얼살롱 성과 자동수집 설치"
echo "======================================================"
echo

# --- 경로 파악 (이 스크립트는 <repo>/visual-auto-web/scripts/ 안에 있음) ---
SCRIPT_DIR=${0:A:h}
WEB_DIR=${SCRIPT_DIR:h}          # visual-auto-web
if [[ ! -f "$WEB_DIR/scripts/crawl-handsos.ts" ]]; then
  echo "❌ 크롤 코드를 못 찾았어요. 이 파일이 visual-auto-web/scripts/ 안에 있는지 확인해주세요."
  echo "   (지금 위치: $SCRIPT_DIR)"
  read "?엔터를 누르면 닫힙니다..."
  exit 1
fi
echo "✔ 코드 위치: $WEB_DIR"

# --- node 확인 ---
if ! command -v node >/dev/null 2>&1; then
  echo "❌ node(Node.js)가 설치돼 있지 않아요."
  echo "   터미널에서: brew install node   (또는 https://nodejs.org 에서 설치) 후 다시 실행해주세요."
  read "?엔터를 누르면 닫힙니다..."
  exit 1
fi
NODE_BIN_DIR=$(dirname "$(command -v node)")
echo "✔ node: $(node -v)  ($NODE_BIN_DIR)"

# --- 의존성 설치 (최초 1회) ---
if [[ ! -d "$WEB_DIR/node_modules/tsx" ]]; then
  echo "… 최초 준비: 의존성 설치 중 (몇 분 걸릴 수 있어요)"
  ( cd "$WEB_DIR" && npm ci )
fi

# --- 비밀값 입력 (이미 있으면 재사용) ---
CONF_DIR="$HOME/.visualsalon"
CONF="$CONF_DIR/crawl.env"
mkdir -p "$CONF_DIR"

if [[ -f "$CONF" ]]; then
  echo "✔ 기존 설정(비밀값)을 그대로 사용합니다: $CONF"
else
  echo
  echo "처음이라 3가지 값이 필요해요 (대표님/개발자에게 안전하게 전달받은 값):"
  echo
  read "HP?  1) HandSOS 로그인 비밀번호: "
  read "SU?  2) Supabase URL (https://...supabase.co): "
  echo    "  3) Supabase 서비스 롤 키 (길게 붙여넣기, 화면엔 안 보임):"
  read -s SK
  echo
  umask 177
  {
    echo "export HANDSOS_PW='$HP'"
    echo "export NEXT_PUBLIC_SUPABASE_URL='$SU'"
    echo "export SUPABASE_SERVICE_ROLE_KEY='$SK'"
  } > "$CONF"
  chmod 600 "$CONF"
  echo "✔ 설정 저장: $CONF"
fi

# --- 야간 수집 래퍼 생성 ---
WRAP="$CONF_DIR/nightly-crawl.sh"
cat > "$WRAP" <<WRAP_EOF
#!/bin/zsh
export PATH="$NODE_BIN_DIR:/usr/bin:/bin:/usr/sbin:/sbin"
source "$CONF"
cd "$WEB_DIR" || exit 1
START=\$(date -v-3d +%F); END=\$(date -v-1d +%F)
{ echo "==================================================="; echo "\$(date '+%F %T %Z') ▶ 수집 시작 (\$START ~ \$END)"; } >> "$CONF_DIR/crawl.log"
npx tsx scripts/crawl-handsos.ts --backfill "\$START" "\$END" >> "$CONF_DIR/crawl.log" 2>&1
echo "\$(date '+%F %T') ◀ 종료 (exit \$?)" >> "$CONF_DIR/crawl.log"
WRAP_EOF
chmod +x "$WRAP"
echo "✔ 야간 수집기 생성: $WRAP"

# --- launchd 등록 (매일 08:30) ---
PLIST="$HOME/Library/LaunchAgents/com.visualsalon.handsos-crawl.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.visualsalon.handsos-crawl</string>
  <key>ProgramArguments</key><array><string>$WRAP</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$CONF_DIR/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$CONF_DIR/launchd.err.log</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLIST_EOF
launchctl bootout "gui/$(id -u)/com.visualsalon.handsos-crawl" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✔ 매일 08:30 자동 수집 등록 완료"

# --- 바탕화면 "지금 수집" 버튼 생성 ---
BTN="$HOME/Desktop/지금 수집.command"
cat > "$BTN" <<BTN_EOF
#!/bin/zsh
export PATH="$NODE_BIN_DIR:/usr/bin:/bin:/usr/sbin:/sbin"
source "$CONF"
cd "$WEB_DIR" || exit 1
echo "=============================="
echo " 비주얼살롱 지금 수집 (어제~오늘)"
echo "=============================="
echo "수집 중이에요… 1~3분 걸려요. 창을 닫지 말고 기다려주세요."
npx tsx scripts/crawl-handsos.ts --backfill "\$(date -v-1d +%F)" "\$(date +%F)"
echo
echo "✅ 완료! 앱 → 성과 대시보드에서 확인하세요."
read "?엔터를 누르면 이 창이 닫힙니다..."
BTN_EOF
chmod +x "$BTN"
echo "✔ 바탕화면에 '지금 수집' 버튼 생성"

echo
echo "======================================================"
echo "  설치 끝! 지금 한 번 수집해서 확인해볼게요…"
echo "======================================================"
source "$CONF"
( cd "$WEB_DIR" && npx tsx scripts/crawl-handsos.ts --date "$(date -v-1d +%F)" ) || true
echo
echo "🎉 모두 완료됐어요."
echo "  • 매일 08:30 자동 수집 (이 맥이 켜져 있을 때)"
echo "  • 바탕화면 '지금 수집' 을 더블클릭하면 즉시 수집"
echo "  • 앱 성과 대시보드에서 확인하세요"
read "?엔터를 누르면 닫힙니다..."
