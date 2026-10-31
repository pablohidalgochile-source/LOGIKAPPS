#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/tools/elephant"
APP="$PWD/build/Elephant.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" build/module-cache
swiftc -module-cache-path "$PWD/build/module-cache" -O -parse-as-library \
  -target arm64-apple-macosx14.0 -file-prefix-map "$PWD=." -debug-prefix-map "$PWD=." -file-compilation-dir . \
  Elephant.swift VideoStudio.swift -o "$APP/Contents/MacOS/Elephant" \
  -framework SwiftUI -framework AppKit -framework ImageIO -framework AVKit -framework AVFoundation
cp worker.py video_worker.py "$APP/Contents/Resources/"
cp assets/elephant-icon.png "$APP/Contents/Resources/mark.png"
cp assets/Elephant.icns "$APP/Contents/Resources/Elephant.icns"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Elephant</string>
<key>CFBundleIdentifier</key><string>cl.logikapps.elephant</string>
<key>CFBundleName</key><string>Elephant</string>
<key>CFBundleDisplayName</key><string>Elephant</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.2.0</string>
<key>CFBundleVersion</key><string>3</string>
<key>CFBundleIconFile</key><string>Elephant</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST
codesign --force --sign - --timestamp=none "$APP"
codesign --verify --deep --strict "$APP"
printf 'Elephant 0.2.0 preparada para Apple Silicon.\n'
