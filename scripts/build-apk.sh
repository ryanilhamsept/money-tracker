#!/usr/bin/env bash
# Build APK release lokal, sekali jalan.
#
# Ada dua jebakan yang bikin APK kelihatan "masih yang lama", dan script ini
# nutup dua-duanya:
#
#   1. versionCode nggak naik -> Android nganggep APK baru identik sama yang
#      udah kepasang, jadi install-nya nggak ngapa-ngapain. Script naikin
#      versionCode + patch versionName otomatis.
#   2. `expo prebuild --clean` ngehapus android/local.properties, dan Gradle
#      langsung mati "SDK location not found". Script nulis ulang file itu.
#
# Hasilnya dicopy ke ~/Downloads dengan nomor versi di nama filenya, supaya
# nggak pernah ketuker sama build sebelumnya.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$REPO/mobile"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"

[ -d "$SDK" ] || { echo "Android SDK nggak ketemu di $SDK" >&2; exit 1; }

# --- 1. naikkan versi -------------------------------------------------------
python3 - "$MOBILE" <<'PY'
import collections, json, re, sys, datetime, pathlib

mobile = pathlib.Path(sys.argv[1])
cfg_path = mobile / "app.json"
cfg = json.loads(cfg_path.read_text(), object_pairs_hook=collections.OrderedDict)
expo = cfg["expo"]

code = int(expo["android"].get("versionCode", 0)) + 1
major, minor, patch = (list(map(int, expo["version"].split("."))) + [0, 0, 0])[:3]
version = f"{major}.{minor}.{patch + 1}"
today = datetime.date.today().isoformat()

expo["version"] = version
expo["android"]["versionCode"] = code
cfg_path.write_text(json.dumps(cfg, indent=2) + "\n")

# version.js dicerminkan di web dan mobile -- dua-duanya ikut naik
for rel in ("src/constants/version.js", "../src/constants/version.js"):
    p = mobile / rel
    s = p.read_text()
    s = re.sub(r'(APP_VERSION = ")[^"]*(")', rf'\g<1>{version}\g<2>', s)
    s = re.sub(r'(BUILD_DATE = ")[^"]*(")', rf'\g<1>{today}\g<2>', s)
    p.write_text(s)

print(f"{version} {code}")
PY

read -r VERSION CODE < <(
  python3 -c "import json;c=json.load(open('$MOBILE/app.json'))['expo'];print(c['version'],c['android']['versionCode'])"
)
echo "==> build v$VERSION (versionCode $CODE)"

# --- 2. prebuild ------------------------------------------------------------
cd "$MOBILE"
npx expo prebuild --platform android --clean --no-install
git -C "$REPO" checkout -- mobile/package.json 2>/dev/null || true

# prebuild --clean menghapus ini, jadi ditulis ulang SETELAHnya
echo "sdk.dir=$SDK" > "$MOBILE/android/local.properties"

# --- 3. gradle --------------------------------------------------------------
cd "$MOBILE/android"
ANDROID_HOME="$SDK" ./gradlew assembleRelease \
  -PreactNativeArchitectures=arm64-v8a --no-daemon

# --- 4. hasil ---------------------------------------------------------------
APK="$MOBILE/android/app/build/outputs/apk/release/app-release.apk"
OUT="$HOME/Downloads/ryanilhamsept-v$VERSION.apk"
cp "$APK" "$OUT"

echo
echo "APK  : $OUT"
echo "Versi: v$VERSION (versionCode $CODE)"
echo "Besar: $(du -h "$OUT" | cut -f1)"
echo "SHA  : $(shasum -a 256 "$OUT" | cut -d' ' -f1)"
