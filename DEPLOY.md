# Deploying OJAS online (Render)

After this, the app works on **any Wi-Fi or mobile data**: no laptop, no `FLASK_HOST`, no IP addresses.

| Service | What | Address |
|---|---|---|
| `ojas-api` | Flask backend (gunicorn) | `https://ojas-api-sh10.onrender.com` |
| `ojas-web` | Browser version of the app | `https://ojas-web-2oi5.onrender.com` |

Both are defined in [`render.yaml`](render.yaml) and deploy from the `main` branch.
Every push to `main` redeploys them automatically.

> **Free plan:** the backend sleeps after ~15 minutes without requests. The first request after
> that takes about 30–60 seconds (the app shows "Cannot reach the OJAS server" if it gives up –
> just try again). The paid "Starter" plan does not sleep.

## 1. Create the services (about 10 minutes, once)

1. Go to **https://render.com** → **Get Started** → sign up with **GitHub**.
2. Allow Render to access the **nupasani2306/OJAS** repository.
3. In Render: **New** → **Blueprint** → choose **OJAS**. Render reads `render.yaml`.
   If it asks which branch holds the Blueprint, choose **`main`**.
4. It asks for the two secret values of `ojas-api` – paste the same values as in your laptop's `.env`:
   * `SUPABASE_URL` – e.g. `https://xxxx.supabase.co`
   * `SUPABASE_KEY` – the **publishable / anon** key (never the `service_role` key)
5. Click **Apply** / **Deploy Blueprint**. The first deploy takes a few minutes.

## 2. Check it works

1. Open the **ojas-api** service in Render and copy its address (top of the page).
   Open `<that address>/api/test-supabase` – it must say *Flask connected to Supabase successfully!*
2. Open the **ojas-web** service's address – the OJAS sign-in page appears. Sign in.

**If Render gave different addresses** (for example `https://ojas-api-ab12.onrender.com` because the
name was taken): open **ojas-web → Environment**, set

* `OJAS_API_BASE` = the real ojas-api address
* `OJAS_WEB_BASE` = the real ojas-web address

then **Manual Deploy → Deploy latest commit** on ojas-web.

## 3. Supabase settings (once)

Supabase → **Authentication → URL Configuration**:

* **Site URL:** the ojas-web address, e.g. `https://ojas-web-2oi5.onrender.com`
* **Redirect URLs:** add `https://ojas-web-2oi5.onrender.com/reset-password.html`

This makes the password-reset email link open the hosted reset page.

## 4. The Android app

Rebuild the APK with the online addresses (no `http` exception is added for an `https` backend):

```powershell
$env:OJAS_API_BASE="https://ojas-api-sh10.onrender.com"
$env:OJAS_WEB_BASE="https://ojas-web-2oi5.onrender.com"
npm run android:sync
```

Then build the APK as in [ANDROID.md](ANDROID.md). The Medical ID QR and forgot password now
work from the app too, because they point at the hosted website.

## Notes

* Secrets (`SUPABASE_URL`, `SUPABASE_KEY`) live only in Render's environment settings and your
  local `.env` – never in the repository or the app.
* Logs: Render → service → **Logs**.
* The website build copies only frontend files (`scripts/build-www.mjs`); no Python or `.env`.
* To deploy from another branch, change `branch:` in `render.yaml` or in each service's
  **Settings → Branch**.
