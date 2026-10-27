#!/usr/bin/env bash
# Builds GitHubTracker.apk from the web app + the WebView shell.
# No Gradle: aapt2 + javac + d8 + zipalign + apksigner.
set -e
ulimit -v unlimited
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
JDK_BIN="${JDK_BIN:-/scratch/work/tools/jdk/bin}"
BT="${BT:-/scratch/work/tools/sdk/build-tools/34.0.0}"
PLATFORM_JAR="${PLATFORM_JAR:-/scratch/work/tools/sdk/platforms/android-34/android.jar}"
OUT="${OUT:-/scratch/output/GitHubTracker.apk}"
export PATH="$JDK_BIN:$PATH"
export _JAVA_OPTIONS="-Xmx256m -Xss512k -XX:MaxMetaspaceSize=200m -XX:CompressedClassSpaceSize=32m -XX:ReservedCodeCacheSize=64m -XX:ActiveProcessorCount=1 -XX:ParallelGCThreads=1 -XX:ConcGCThreads=1"

B=build
rm -rf "$B" && mkdir -p "$B/gen" "$B/obj"

echo "[0/6] staging web assets"
rm -rf app/assets/www && mkdir -p app/assets/www
for f in index.html gh.js gh.css app.css tracker.css motion.css manifest.json icon.svg; do
  [ -f "$ROOT/web/$f" ] && cp "$ROOT/web/$f" app/assets/www/
done
cp -r "$ROOT/web/fonts" app/assets/www/
du -sh app/assets/www

echo "[1/6] aapt2 compile"
"$BT/aapt2" compile --dir app/res -o "$B/res.zip"
echo "[2/6] aapt2 link"
"$BT/aapt2" link -o "$B/app.unsigned.apk" -I "$PLATFORM_JAR" \
  --manifest app/AndroidManifest.xml -A app/assets --java "$B/gen" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --auto-add-overlay "$B/res.zip"
echo "[3/6] javac"
set +e
javac -source 11 -target 11 -nowarn -classpath "$PLATFORM_JAR" \
  -d "$B/obj" "$B/gen/com/onegit/tracker/R.java" $(find app/java -name '*.java') > "$B/javac.log" 2>&1
RC=$?
set -e
grep -v 'Picked up' "$B/javac.log" | head -30 || true
if [ $RC -ne 0 ]; then echo "JAVAC FAILED"; exit 1; fi
echo "[4/6] d8"
(cd "$B" && "${BT}/d8" --release --lib "$PLATFORM_JAR" --min-api 24 --output . $(find obj -name '*.class'))
echo "[5/6] dex + zipalign"
(cd "$B" && zip -qj app.unsigned.apk classes.dex)
"$BT/zipalign" -f 4 "$B/app.unsigned.apk" "$B/app.aligned.apk"
echo "[6/6] sign"
if [ ! -f debug.keystore ]; then
  keytool -genkeypair -keystore debug.keystore -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=GitHub Tracker Debug,O=OneGit,C=IN" >/dev/null 2>&1
fi
mkdir -p "$(dirname "$OUT")"
"$BT/apksigner" sign --ks debug.keystore --ks-pass pass:android \
  --v4-signing-enabled false --out "$OUT" "$B/app.aligned.apk"
"$BT/apksigner" verify --print-certs "$OUT" | head -2
echo "BUILD OK -> $OUT"
ls -la "$OUT"
