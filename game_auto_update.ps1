# Auto-updates game.json from the local game-record folder, then commits & pushes.
# Run by Windows Task Scheduler (see setup). Logs to game-update.log.
$ErrorActionPreference = 'Continue'
$env:GIT_TERMINAL_PROMPT = '0'
$repo = 'C:\Users\sunwo\vn-pistol-archive'
$log  = Join-Path $repo 'game-update.log'
Set-Location $repo
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Out-File -Append -Encoding utf8 $log }

Log '=== auto update start ==='

# 1) extract game records -> web/game.json
python game-etl.py 2>&1 | Out-File -Append -Encoding utf8 $log

# 1b) ISSF 세계랭킹 자동 수집 -> web/training-check/worldrank.json (실패해도 계속)
python worldrank-etl.py 2>&1 | Out-File -Append -Encoding utf8 $log

# 2) stage; skip the rest if nothing changed
git add web/game.json web/training-check/worldrank.json 2>&1 | Out-File -Append -Encoding utf8 $log
$changed = git status --porcelain web/game.json web/training-check/worldrank.json
if ([string]::IsNullOrWhiteSpace($changed)) {
    Log 'no change in game.json / worldrank.json - nothing to push'
    Log '=== done (noop) ==='
    return
}

# 3) commit, sync, push
git -c user.name=RYONG -c user.email=sunwooryong@gmail.com commit -m 'auto update: game record + ISSF world ranking (scheduled)' 2>&1 | Out-File -Append -Encoding utf8 $log
git pull --rebase origin main 2>&1 | Out-File -Append -Encoding utf8 $log
git push origin main 2>&1 | Out-File -Append -Encoding utf8 $log
if ($LASTEXITCODE -eq 0) { Log 'pushed OK' } else { Log "push FAILED (exit $LASTEXITCODE) - will retry next run" }
Log '=== done ==='
