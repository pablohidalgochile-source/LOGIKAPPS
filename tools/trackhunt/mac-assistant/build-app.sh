#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
build_root="${TRACKHUNT_BUILD_ROOT:-$PWD/build}"
scratch="$build_root/swift"
python="$build_root/python-env/bin/python"
if [[ ! -x "$python" ]]; then
  printf 'First run: python3 -m venv build/python-env; build/python-env/bin/pip install -r engine/requirements.lock\n' >&2
  exit 1
fi
export PYINSTALLER_CONFIG_DIR="$build_root/pyinstaller-cache"
export CLANG_MODULE_CACHE_PATH="$build_root/clang-cache"
export SWIFT_MODULE_CACHE_PATH="$build_root/swift-module-cache"
if [[ "${TRACKHUNT_REUSE_ENGINE:-0}" != 1 ]]; then
"$python" -m PyInstaller --noconfirm --clean --onedir --name trackhunt-recognize \
  --distpath "$build_root/engine-dist" --workpath "$build_root/engine-work" --specpath "$build_root" \
  --collect-all shazamio --collect-all shazamio_core --collect-data certifi engine/recognize.py
fi
"$build_root/engine-dist/trackhunt-recognize/trackhunt-recognize" --self-check
swift build -c release --product TrackHuntAssistant --scratch-path "$scratch"
binary_dir="$(swift build -c release --show-bin-path --scratch-path "$scratch")"
app="$build_root/Track Hunt Assistant.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/engine"
cp "$binary_dir/TrackHuntAssistant" "$app/Contents/MacOS/TrackHuntAssistant"
cp Info.plist "$app/Contents/Info.plist"
ditto "$build_root/engine-dist/trackhunt-recognize" "$app/Contents/Resources/engine"
cp engine/THIRD-PARTY-NOTICES.txt "$app/Contents/Resources/"
# Local ad-hoc signature: no Apple membership, credentials, or notarization.
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
ditto -c -k --keepParent --norsrc "$app" "$build_root/TrackHunt-Assistant-Mac.zip"
printf 'Built local ShazamIO app: %s\n' "$app"
