#!/bin/zsh
# 비주얼살롱 자동 수집 제거 — launchd 예약과 바탕화면 버튼을 지웁니다.
# (비밀 설정 ~/.visualsalon/crawl.env 은 남겨둠. 완전 삭제하려면 아래 주석 참고.)
emulate -L zsh
launchctl bootout "gui/$(id -u)/com.visualsalon.handsos-crawl" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.visualsalon.handsos-crawl.plist"
rm -f "$HOME/Desktop/지금 수집.command"
echo "✔ 자동 수집(예약)과 '지금 수집' 버튼을 제거했어요."
echo "  설정/로그를 완전히 지우려면 터미널에서: rm -rf ~/.visualsalon"
read "?엔터를 누르면 닫힙니다..."
