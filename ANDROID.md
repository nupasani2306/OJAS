# OJAS Android app (Capacitor)

The Android app is the **same HTML/CSS/JS app** as the browser version, packaged with
[Capacitor](https://capacitorjs.com/). Screens, Flask backend, Supabase and the ESP32 firmware are
unchanged. In the app, the OJAS Band is reached through native Bluetooth
(`@capacitor-community/bluetooth-le`) instead of Chrome's Web Bluetooth.

> **Status:** the Android project, the native Bluetooth layer and the configuration were built and
> checked in a desktop browser with a simulated Bluetooth plugin. **No APK has been built and
> nothing has been tested on a phone or with the band yet** – see the checklist below.

## How it fits together

```text
project root (browser version, unchanged)
   │  npm run build:www   (scripts/build-www.mjs)
   ▼
www/  – copy of the 14 pages + their scripts/styles, plus:
        config.js               OJAS_API_BASE / OJAS_WEB_BASE for the app
        vendor/capacitor-native.js native Bluetooth + back button plugins (app only)
   │  npx cap sync android
   ▼
android/  – Android Studio project (app ID com.ojas.app)
```

Only frontend files are copied into `www/`. Python, `routes/`, `firmware/`, `supabase/`, `.env`,
`.git` and `node_modules` are never copied, and no secret keys are in the app: Supabase keys stay
in the Flask `.env`.

`ble-adapter.js` chooses the Bluetooth transport: native in the app, Web Bluetooth in a browser.
`band.js` (device name `OJAS-Band`, UUIDs, JSON parsing, validity checks, FALL_PENDING / FALL / SOS /
CANCELLED, ACK / CANCEL, duplicate prevention) is shared by both.

## 1. What you need on your laptop

* **Node.js 22 or newer** (`node -v`)
* **Android Studio** (includes the Android SDK and Java). In *SDK Manager* install **Android SDK
  Platform 36** and *Android SDK Build-Tools*.
* An **Android phone** with *Developer options → USB debugging* on, and a USB cable.
* The OJAS Band flashed with the V2 firmware.

## 2. Make the backend reachable from the phone

Inside the app, `localhost` / `127.0.0.1` is **the phone**, not your laptop. Choose one:

**A. Laptop on the same Wi-Fi (development)**

1. Find the laptop's Wi-Fi address: Windows `ipconfig` (IPv4 Address), Mac/Linux `ipconfig getifaddr en0` / `hostname -I`.
   Example below: `192.168.1.20`.
2. Start Flask so the phone can reach it (debug mode turns itself off when it listens on the network):

   ```powershell
   # Windows PowerShell
   $env:FLASK_HOST="0.0.0.0"; python app.py
   ```
   ```bash
   # Mac / Linux
   FLASK_HOST=0.0.0.0 python app.py
   ```
3. On the phone's browser, open `http://192.168.1.20:5000/api/test-supabase` – it must say
   *Flask connected to Supabase successfully!* If not, allow Python through the Windows firewall
   (Private networks) and check both devices are on the same Wi-Fi.

**B. Deployed backend (recommended for real use)** – deploy Flask with HTTPS (Render, Railway,
PythonAnywhere …) with `SUPABASE_URL` / `SUPABASE_KEY` set in the host's settings, then use that
`https://…` address below.

Plain `http://` is only allowed for the exact host in `OJAS_API_BASE` (the build writes
`android/app/src/main/res/xml/network_security_config.xml`). An `https://` backend gets no exception.

## 3. Build the APK

From the project root (run again after **any** change to the HTML/CSS/JS files):

```powershell
# Windows PowerShell
npm install
$env:OJAS_API_BASE="http://192.168.1.20:5000"     # or https://your-backend
$env:OJAS_WEB_BASE="https://your-website"         # optional, see "Links that leave the phone"
npm run android:sync
npm run android:open
```

```bash
# Mac / Linux
npm install
OJAS_API_BASE=http://192.168.1.20:5000 OJAS_WEB_BASE=https://your-website npm run android:sync
npm run android:open
```

`android:sync` builds `www/` (it prints the addresses it used and warns if `OJAS_API_BASE` is
missing or points at localhost) and copies it into the Android project.

In Android Studio (first open downloads Gradle and dependencies – wait for *Gradle sync* to finish):

* **Run on your phone:** connect it by USB, choose it in the device list, press **Run ▶**.
* **Build an APK file:** *Build → Build App Bundle(s) / APK(s) → Build APK(s)* →
  `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to the phone and open it to install
  (allow "Install unknown apps").

Command-line alternative (Android SDK installed, `ANDROID_HOME` set):

```bash
cd android
./gradlew assembleDebug          # Windows: gradlew.bat assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

A Play Store release needs a signed **release** build (*Build → Generate Signed App Bundle*) and an
`https://` backend.

## 4. Android permissions

| Permission | Why |
|---|---|
| `INTERNET` | Flask API |
| `BLUETOOTH_SCAN` (`neverForLocation`), `BLUETOOTH_CONNECT` | Find and connect to the band on Android 12+ ("Nearby devices") |
| `BLUETOOTH`, `BLUETOOTH_ADMIN` (Android 11 and older only) | Bluetooth on older Android |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Bluetooth scanning on Android 11 and older, and the map link in SOS / fall messages |
| `bluetooth_le` feature (not required) | The app still installs on phones without BLE |

Bluetooth permission is requested the first time you tap **Connect band**. Location should be
requested (through Capacitor's WebView) the first time an SOS / fall message needs the map link –
untested on a phone; without it the message is sent without the map link.

## 5. Bluetooth and page changes – what to expect

* Each screen is a separate page, so moving between screens reloads the page. On leaving a page the
  app stops the band notifications; the next page reconnects to the saved band **without the
  picker** (the plugin answers *Already connected* if the link is still up) and subscribes again.
* During that short reconnect (about 1–2 s, **not yet measured on a phone**), live values pause.
  `FALL` and `SOS` are not lost (the band re-sends them until the app answers `ACK`); a single
  `FALL_PENDING` sent exactly then could be missed – the band still sends `FALL` after its 10 s
  countdown.
* **Monitoring while the app is closed or the screen is off is not supported yet.** That needs a
  native Android *foreground service* (separate task, see below).
* Signing out forgets the saved band.

**Phone back button** (`back-button.js`, app only): closes an open popup first; on Home or the
sign-in page it closes the app; on any other screen it goes to the previous screen (Home if there
is none). It is ignored while the fall / SOS alert or the band-pairing screen is showing, so an
emergency cannot be dismissed by accident.

## 6. Links that leave the phone

The password-reset email link and the Medical ID QR code point at `OJAS_WEB_BASE` (the browser
version hosted online). Without it:

* **Medical ID QR** points at the app's internal address, so other phones cannot open it (the
  sheet shows the "hosted online" note).
* **Forgot password** emails a link to the app's internal address, which does not open.

Once the browser version is hosted, set `OJAS_WEB_BASE`, rebuild, and add
`<OJAS_WEB_BASE>/reset-password.html` to Supabase → Authentication → URL Configuration → Redirect URLs.

## 7. Test checklist

Verified so far **only in a desktop browser** (the `www/` copy, the browser version, and the native
Bluetooth layer against a simulated plugin with the real plugin's API). Everything in the
"On phone" column is **untested** until you run it.

| Area | Desktop browser / simulated plugin | On phone with the band |
|---|---|---|
| All 14 screens load, styling, links between screens | ✅ | untested |
| Sign in / sign up / sign out | ✅ (simulated backend) | untested |
| Flask API requests from the app (`OJAS_API_BASE`) | ✅ Flask reachable on the network with `FLASK_HOST=0.0.0.0` | untested |
| Supabase persistence (readings, events) | ✅ requests sent (simulated backend) | untested |
| Bluetooth permission prompts | ✅ simulated | untested |
| Scan / picker / connect to OJAS-Band | ✅ simulated | untested |
| Live heart rate, SpO₂, steps, battery; "--" without finger | ✅ simulated | untested |
| SOS from the band (ACK, no duplicates) | ✅ simulated | untested |
| Fall countdown, Cancel (CANCEL to band), CANCELLED from band | ✅ simulated | untested |
| Disconnect → automatic reconnect | ✅ simulated | untested |
| Reconnect after changing screens | ✅ simulated | untested (timing unknown) |
| Phone back button (popups, previous screen, close app) | ✅ simulated | untested |
| Messages app opens for SOS (`sms:` link) | – | untested |
| Location for the SOS map link | – | untested |
| Photo / document upload (file picker) | – | untested |
| APK build | – | **not built yet** |

## 8. Known limitations / next tasks

* **Background monitoring** (screen off / app closed): needs an Android foreground service.
* **Release build:** HTTPS backend, signing key, and remove `allowMixedContent` from
  `capacitor.config.json` (only needed for an `http://` development backend).
* **Hosted web version** for the reset link and Medical ID QR (`OJAS_WEB_BASE`).
* **iOS** is not set up (`npx cap add ios` needs a Mac with Xcode).
* `navigator.share` is not available in the app's WebView; *Share* on the Medical ID copies the link instead.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot reach the OJAS server (http://127.0.0.1:5000)" | `OJAS_API_BASE` was not set – set it and run `npm run android:sync` again |
| "Cannot reach the OJAS server (http://192.168.…)" | Flask not started with `FLASK_HOST=0.0.0.0`, firewall, or phone on another Wi-Fi |
| "Bluetooth is off" | Turn on Bluetooth (the app also asks) |
| "…needs the Bluetooth ("Nearby devices") permission" | Android Settings → Apps → OJAS → Permissions → Nearby devices → Allow |
| Band not in the picker | Band off, or connected to another phone/laptop (it accepts one connection) |
| Changes to HTML/JS not in the app | Run `npm run android:sync` again, then Run in Android Studio |
