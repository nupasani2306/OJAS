# OJAS – Smart Wearable Health & Emergency Assistance System

OJAS is a smart wearable-based health monitoring and emergency assistance system designed to help users monitor important health parameters and quickly respond to emergency situations.

The system combines an ESP32-C3 based wearable device with a Flutter mobile application, Flask backend, PostgreSQL database, and cloud storage.

---

## 🚀 Features

### Health Monitoring
- Heart Rate monitoring
- SpO₂ monitoring
- Step counting
- Calorie tracking
- Sleep monitoring
- Water intake tracking

### Emergency Assistance
- Automatic fall detection
- Emergency countdown and cancellation
- Manual SOS button
- Emergency contact management
- Emergency and SOS messages
- Emergency alert processing

### Medical Profile
- Blood group
- Allergies
- Medical conditions
- Medications
- Height and weight
- Medical notes
- Medical document storage
- Medical ID / QR functionality

### Fitness
- Workout tracking
- Workout goals
- Exercise and set tracking
- Workout history

### Mobile Application
- User registration and login
- Health dashboard
- Live monitoring
- Health history
- Emergency contacts
- Medical profile
- Device management
- Beast Mode / workout tracking
- Chatbot
- Settings

---

## 🏗️ System Architecture

```text
                 ┌──────────────────────┐
                 │      OJAS Wearable   │
                 │                      │
                 │      ESP32-C3        │
                 │         │            │
                 │   ┌─────┴─────┐      │
                 │   │ Sensors   │      │
                 │   │           │      │
                 │   │ MAX30102  │      │
                 │   │ MPU6050   │      │
                 │   │ SOS Button│      │
                 │   └───────────┘      │
                 └──────────┬───────────┘
                            │
                           BLE
                            │
                            ▼
                 ┌──────────────────────┐
                 │    Flutter Mobile    │
                 │        App           │
                 └──────────┬───────────┘
                            │
                         HTTPS/REST
                            │
                            ▼
                 ┌──────────────────────┐
                 │     Flask Backend    │
                 │                      │
                 │ Authentication       │
                 │ Business Logic       │
                 │ Health APIs           │
                 │ Emergency APIs        │
                 │ File Upload           │
                 └──────────┬───────────┘
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
          ┌──────────────┐    ┌────────────────┐
          │ PostgreSQL   │    │ Cloud Storage  │
          │   Database   │    │ Medical Docs   │
          └──────────────┘    └────────────────┘

---

## 📡 OJAS Band (live readings over Bluetooth)

The web app connects to the ESP32-C3 band directly with Chrome's Web Bluetooth (`band.js`):

```text
OJAS-Band ──BLE notify──▶ band.js (one connection per page) ──▶ home cards / fall & SOS dialog
                                   └──▶ Flask API: readings once a minute, band battery & connection
```

| BLE | UUID |
|---|---|
| Service | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` |
| Vitals (notify, JSON) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` |
| Alert (notify: `FALL_PENDING`, `FALL`, `SOS`, `CANCELLED`) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` |
| Command (write: `ACK` after FALL/SOS, `CANCEL` from "I'm OK") | `6e400004-b5a3-f393-e0a9-e50e24dcca9e` |

Heart rate / SpO₂ are shown only when the band marks them valid (`hrValid`, `spo2Valid`) and a
finger is on the sensor (`finger`); otherwise the card shows `--`.

### Browser requirements
- **Chrome or Edge** (Android, Windows, Mac, ChromeOS). Firefox and iPhone browsers have no Web Bluetooth.
- The page must be opened from `http://localhost` / `http://127.0.0.1` or over `https`.
  Live Server on the laptop (`http://127.0.0.1:5500`) is fine.

### Test on the laptop
1. `python app.py` (backend on port 5000) and open `index.html` with Live Server.
2. Sign in, then on Home tap **Connect band** and choose **OJAS-Band**.

### Test on an Android phone (Chrome)
1. Phone: enable *Developer options → USB debugging* and connect it to the laptop with USB.
2. Laptop Chrome: open `chrome://inspect/#devices` → **Port forwarding…** → add
   `5500 → localhost:5500` and `5000 → localhost:5000`, tick *Enable port forwarding*.
3. Phone Chrome: open `http://localhost:5500/index.html`, sign in, tap **Connect band**.

### Staying connected when you change pages
A Bluetooth connection ends when a page is closed. To reconnect automatically on the next page,
enable `chrome://flags/#enable-web-bluetooth-new-permissions-backend` in Chrome (once).
Without it, tap **Connect band** on Home again after moving between pages.

### "The band's data is arriving incomplete"
Each Vitals notification must contain the whole JSON object. If the BLE packet size is too small
for the JSON, it gets cut off. Android 14+ and desktop Chrome negotiate a large packet size
automatically; on older phones, test on the laptop or shorten the JSON in the firmware.

---

## 🚨 Emergency alerts (SOS and falls)

| Trigger | What happens |
|---|---|
| SOS from the band, or the SOS button in the app | The SOS message is sent straight away to the **SOS contacts** (no confirmation). |
| `FALL_PENDING` from the band | A 10-second countdown with **Cancel emergency**. Cancel → nothing is sent (the band is told `CANCEL`). |
| Countdown ends, or `FALL` from the band | The emergency message is sent to the **emergency contacts**. |
| The same alert repeated | Ignored: each emergency is sent once. |

The Flask backend sends the SMS (`POST /api/emergency/events/<id>/notify`) using **Twilio**.
Add these to `.env` (never commit them):

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
SMS_DEFAULT_COUNTRY_CODE=+91
```

A Twilio **trial** account only sends to numbers you have verified in the Twilio console.
Without these settings the app opens the phone's Messages app with the contacts and message
filled in instead (one tap on Send).

## 🔑 Forgot password

Sign-in page → **Forgot password?** → enter email → Supabase emails a reset link →
`reset-password.html` → choose a new password. The old password is never retrieved or shown.

One-time Supabase setup (Dashboard → **Authentication → URL Configuration → Redirect URLs**), add:

```
http://127.0.0.1:5500/reset-password.html
http://localhost:5500/reset-password.html
```

Supabase's built-in email service has a low hourly limit and may only deliver to your
project's team members. For real users, set up your own SMTP under
**Authentication → Emails → SMTP Settings**.
