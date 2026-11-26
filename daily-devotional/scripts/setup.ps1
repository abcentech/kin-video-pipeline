# One-time setup (Windows). From the daily-devotional folder:  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
# It installs npm + python packages and creates december\config.local.json.
# It does NOT download whisper.cpp, the whisper model, the matte model or the sample library:
# it prints the steps for those at the end.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$root = (Get-Location).Path
$bad = $false

Write-Host "==> Prerequisites"
if (Get-Command node -ErrorAction SilentlyContinue) {
  $major = [int](node -p "process.versions.node.split('.')[0]")
  if ($major -ge 20) { Write-Host "  node $(node -v) ok" } else { Write-Host "  ! node 20+ needed (found $(node -v))"; $bad = $true }
} else { Write-Host "  ! node missing (need 20+)"; $bad = $true }
foreach ($t in "ffmpeg", "ffprobe") {
  if (Get-Command $t -ErrorAction SilentlyContinue) { Write-Host "  $t ok" } else { Write-Host "  ! $t missing (winget install Gyan.FFmpeg)"; $bad = $true }
}
$py = $null
foreach ($v in "3.12", "3.11") {
  & py "-$v" --version 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $py = @("py", "-$v"); break }
}
if ($py) { Write-Host "  python $($py -join ' ') ok" } else { Write-Host "  ! python 3.11 or 3.12 missing (the 'py' launcher must find it)"; $bad = $true }
if ($bad) { Write-Host "Fix the items marked ! and run this again."; exit 1 }

Write-Host "==> npm dependencies"
npm install
if ($LASTEXITCODE -ne 0) { exit 1 }
Push-Location tools\matte; npm install; Pop-Location

Write-Host "==> Python environment (studio\.venv)"
if (-not (Test-Path studio\.venv)) { & $py[0] $py[1] -m venv studio\.venv }
& studio\.venv\Scripts\python.exe -m pip install --upgrade pip
& studio\.venv\Scripts\python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "==> Local config"
if (-not (Test-Path december\config.local.json)) {
  Copy-Item december\config.example.json december\config.local.json
  Write-Host "  created december\config.local.json: edit the paths in it (recordings folder, guide, film master, whisper)."
} else { Write-Host "  december\config.local.json already exists" }
New-Item -ItemType Directory -Force inbox, assets, december-public\outro | Out-Null

@"

==> Setup finished. Still to do by hand (nothing below was done for you):

1. whisper.cpp (speech to words)
   - Download the Windows x64 release zip from https://github.com/ggml-org/whisper.cpp (Releases)
     and unzip it so that whisper-cli.exe sits at tools\whisper\Release\whisper-cli.exe
   - Model file ggml-large-v3-turbo-q5_0.bin from https://huggingface.co/ggerganov/whisper.cpp
     -> tools\whisper\ggml-large-v3-turbo-q5_0.bin
   - Or keep them elsewhere and set "whisperExe" / "whisperModel" in december\config.local.json.

2. Presenter matte model (trailer cut-outs, tools\matte\rvm.mjs)
   - The file must be: tools\matte\models\rvm_mobilenetv3_fp32.onnx
     (Robust Video Matting, MobileNetV3, fp32 ONNX). The code documents no download address:
     supply it yourself.

3. Orchestral sample library for the sound stage (CC0, about 1.1 GB, downloaded from GitHub)
   - studio\.venv\Scripts\python.exe -I scripts\viral\studio\fetch_samples.py
   - Files land in studio\samples\. Run it only when you are ready for the download.

4. Assets you supply (not in this repo)
   - Recordings: Day_<N>.mp4 in the "inbox" folder (or set "inbox").
   - The teaching guide HTML and the picture-film master (set "guide", "filmMaster").
   - december-public\outro\LikeShare_16x9.mp4 and LikeShare_9x16.mp4 (the like/share sign-off, about 21 MB).
   - Optional: the OpenAI Codex CLI ("codex") for generated illustrations; without it, put your own
     plates in december-public\dayNN\art\ (see README.md).

Then:  npm run selftest   (compiler self-test, needs no media)
"@ | Write-Host
