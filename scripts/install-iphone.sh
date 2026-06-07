#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/ios"

PROJECT="${RESURFACE_PROJECT:-Resurface.xcodeproj}"
SCHEME="${RESURFACE_SCHEME:-Resurface}"
CONFIGURATION="${RESURFACE_CONFIGURATION:-Debug}"
BUNDLE_ID="${RESURFACE_BUNDLE_ID:-dev.willworth.resurface}"
DEVICE_ID="${RESURFACE_DEVICE_ID:-}"
LAUNCH=1

usage() {
  cat <<'USAGE'
Usage: scripts/install-iphone.sh [--no-launch]

Builds Resurface for a connected physical iPhone, lets Xcode refresh free
provisioning profiles when needed, installs the app, and launches it.

Environment overrides:
  RESURFACE_DEVICE_ID       Physical device UDID/identifier to use.
  RESURFACE_PROJECT         Xcode project. Default: Resurface.xcodeproj
  RESURFACE_SCHEME          Xcode scheme. Default: Resurface
  RESURFACE_CONFIGURATION   Xcode configuration. Default: Debug
  RESURFACE_BUNDLE_ID       Bundle identifier. Default: dev.willworth.resurface
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --no-launch)
      LAUNCH=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$DEVICE_ID" ]]; then
  DEVICE_ID="$(
    xcodebuild -project "$PROJECT" -scheme "$SCHEME" -showdestinations 2>/dev/null |
      perl -ne 'if (/platform:iOS, arch:[^,]+, id:([^,]+), name:([^,}]+)/) { print "$1\n"; exit }'
  )"
fi

if [[ -z "$DEVICE_ID" ]]; then
  cat >&2 <<'ERROR'
No connected physical iPhone destination was found.

Check:
  1. The iPhone is plugged in with a data-capable cable.
  2. The iPhone is unlocked and trusted by this Mac.
  3. Xcode can see the phone as an iOS run destination.
  4. Developer Mode is enabled on the iPhone if iOS requested it.
ERROR
  exit 1
fi

DESTINATION="platform=iOS,id=$DEVICE_ID"

echo "Building $SCHEME ($CONFIGURATION) for device $DEVICE_ID..."
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination "$DESTINATION" \
  -allowProvisioningUpdates \
  build

BUILD_SETTINGS="$(mktemp)"
trap 'rm -f "$BUILD_SETTINGS"' EXIT

xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination "$DESTINATION" \
  -showBuildSettings > "$BUILD_SETTINGS"

TARGET_BUILD_DIR="$(awk -F' = ' '/ TARGET_BUILD_DIR = / { print $2; exit }' "$BUILD_SETTINGS")"
WRAPPER_NAME="$(awk -F' = ' '/ WRAPPER_NAME = / { print $2; exit }' "$BUILD_SETTINGS")"
APP_PATH="$TARGET_BUILD_DIR/$WRAPPER_NAME"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Built app was not found at: $APP_PATH" >&2
  exit 1
fi

echo "Installing $APP_PATH..."
xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH"

if [[ "$LAUNCH" -eq 1 ]]; then
  echo "Launching $BUNDLE_ID..."
  if ! xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" --terminate-existing; then
    cat >&2 <<'ERROR'
Install succeeded, but launch failed.

If this is the first install after re-signing, trust the developer profile on
the iPhone:
  Settings > General > VPN & Device Management > Developer App > Trust

Then tap Resurface on the phone, or rerun this script.
ERROR
    exit 1
  fi
fi

echo "Done."
