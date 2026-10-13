# Live Market Rate Management System

One permanent link for customers. The admin updates the rate from a phone, and anyone who opens or refreshes the link sees the new rate. No second WhatsApp message is needed.

| Page / API | Who | Purpose |
|---|---|---|
| `/rate` | Public | Today's market rate (read-only) |
| `/admin/login` | Admin | Sign in |
| `/admin` | Admin (protected) | View, publish and share the rate |
| `GET /api/rate` | Public | Current published rate as JSON |
| `POST /api/rate` | Admin session | Publish a new rate |
| `POST /api/admin/login` | — | Create an admin session |
| `POST /api/admin/logout` | — | End the admin session |

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Vercel · Upstash Redis (managed key-value store via the Vercel Marketplace). No traditional database and no separate backend.

---

## 1. Before you start: plans and limits (checked October 2026)

### Vercel Hobby (free) is non-commercial only
Vercel's Fair Use Guidelines say Hobby is for **non-commercial personal use only**, and they define commercial use broadly. It includes a site built for a business's financial gain, and a paid consultant writing the code. A rate page for a trading business is almost certainly commercial, so plan for **Vercel Pro** in production. Nothing in this code depends on the plan; upgrading is only a billing change. See <https://vercel.com/docs/limits/fair-use-guidelines>.

For reference, the Hobby usage guidelines include 1,000,000 function invocations and 100 GB of fast data transfer a month. This app uses about 2 invocations per customer visit, so usage limits are not a concern.

### Storage: Upstash Redis
"Vercel KV" no longer exists. Vercel moved it to Upstash in December 2024 and now offers Redis through Marketplace integrations (<https://vercel.com/docs/redis>). Upstash's free tier (<https://upstash.com/pricing/redis>) includes **500K commands/month, 250 MB of data and 10 GB bandwidth**. This app uses about 2 commands per customer visit, so roughly 250,000 page views a month fit in the free tier.

Prices and limits change, so check both pages again before you go live.

---

## 2. How it works

```
Customer phone ──GET /rate──► Next.js (server render, never cached) ──GET──► Upstash Redis
                                                                           key: market-rate:current
Admin phone ──POST /api/rate (session cookie)──► validate ──SET──────────► { rate, marketDate,
                                                                             updatedAt, status }
```

- **One atomic record.** The rate, market date, timestamp and status are stored together as one JSON value under one key and written with a single `SET`. Customers never see a half-updated record. If a write fails, the previous rate stays as it was.
- **No stale rates.** `/rate` and `/api/rate` are dynamic (`force-dynamic`) and send `Cache-Control: no-store` (plus `CDN-Cache-Control` and `Vercel-CDN-Cache-Control`). The Refresh button adds a cache-busting parameter, and the page also re-checks when the customer switches back to it from WhatsApp.
- **No fake numbers.** Before the first publish, customers see "Today's rate has not been published yet." If storage is down, they see a friendly error, never ₹0 or a placeholder rate.
- **Server timestamps.** `updatedAt` is always set by the server. Times are shown in IST whatever the phone's settings.

### Security
- Credentials are checked on the server only, with a constant-time comparison. They come from environment variables that are never sent to the browser (no `NEXT_PUBLIC_` prefix).
- Sessions use a random 256-bit ID, HMAC-signed with `SESSION_SECRET` and also recorded in Redis with an 8-hour expiry. **Logout deletes the server-side record**, so a copied cookie stops working immediately. No in-memory sessions are used, because serverless instances do not share memory.
- Cookie: `__Host-rate_admin`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.
- State-changing APIs also check the `Origin` / `Sec-Fetch-Site` headers to block cross-site requests.
- Login throttling: 5 failed attempts per IP address per 15 minutes, stored in Redis. It works per IP rather than per username, so nobody can lock the real admin out just before 11:30.
- `/admin` is checked on the server on every request. Hidden URLs and client state are never trusted.
- Security headers are set: `X-Frame-Options: DENY`, `nosniff`, HSTS, `Referrer-Policy` and `Permissions-Policy`. Admin pages are marked `noindex`.
- Logs never include passwords, tokens or the session secret.

---

## 3. Project structure

```
app/
  layout.tsx, globals.css, page.tsx (redirects / → /rate)
  rate/page.tsx, rate/loading.tsx        public rate page
  admin/layout.tsx                        noindex for admin pages
  admin/login/page.tsx                    login page
  admin/page.tsx                          protected dashboard (server-side check)
  api/rate/route.ts                       GET (public) / POST (admin)
  api/admin/login/route.ts                POST login
  api/admin/logout/route.ts               POST logout
components/
  RateCard.tsx, RateView.tsx, RefreshRateButton.tsx   public UI
  AdminDashboard.tsx, AdminRateForm.tsx, ConfirmPublishDialog.tsx,
  ShareLinkPanel.tsx, LogoutButton.tsx, LoginForm.tsx, icons.tsx
lib/
  env.ts          environment configuration (server-only)
  kv.ts           Upstash REST client (+ dev-only in-memory fallback)
  rate-store.ts   the published-rate record
  session.ts      signed, server-revocable sessions
  auth.ts         session check for pages and APIs
  credentials.ts  constant-time credential check
  rate-limit.ts   login throttling
  validation.ts   rate / date / login validation (shared by client and server)
  format.ts       ₹ en-IN formatting, IST dates and times
  rate-client.ts  browser fetch helper
  http.ts         API helpers (no-store headers, origin check, IP)
tests/            unit tests (npm test)
```

---

## 4. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ADMIN_USERNAME` | Yes | Admin login name |
| `ADMIN_PASSWORD` | Yes | Long, unique password (16+ characters recommended) |
| `SESSION_SECRET` | Yes | At least 32 random characters. Changing it logs everyone out. |
| `KV_REST_API_URL` | Yes (production) | Added automatically by the Upstash integration |
| `KV_REST_API_TOKEN` | Yes (production) | Added automatically by the Upstash integration |
| `BUSINESS_NAME` | Optional | Shown on the public page (default "Market Rates") |
| `PUBLIC_SITE_URL` | Optional | Overrides the link in the WhatsApp message. By default, Vercel's production `.vercel.app` URL is used. |

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are accepted in place of the `KV_` names, for a database created directly in the Upstash console.

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Development and production settings.** In Vercel → Project → Settings → Environment Variables, every variable has checkboxes for **Production**, **Preview** and **Development**. Use different `ADMIN_PASSWORD` and `SESSION_SECRET` values for Production and for Preview/Development. Ideally, connect a **second free Upstash database** to Preview and Development, so testing never changes the live customer rate. Locally, `.env.local` (git-ignored) holds your development values.

If `KV_REST_API_URL` / `KV_REST_API_TOKEN` are empty while running `npm run dev`, the app uses a temporary **in-memory** store, so you can try the UI without an account. The console shows a warning. In production this fallback is disabled and missing storage settings are reported as an error.

---

## 5. Setup and deployment (step by step)

Requirements: Node.js 20.9 or newer, a GitHub account, and a Vercel account (sign up with GitHub).

### 5.1 Create the project
This folder already contains the complete project, so you don't need `create-next-app`. (For reference, the equivalent starting point would be `npx create-next-app@latest staticrateupdater --ts --tailwind --app --no-src-dir`.)

### 5.2 Install dependencies
```bash
cd staticrateupdater
npm install
```

### 5.3 Run locally
```bash
copy .env.example .env.local        # Windows (macOS/Linux: cp .env.example .env.local)
# edit .env.local: set ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET
npm run dev
```
Open <http://localhost:3000/rate> and <http://localhost:3000/admin/login>.

Run the checks:
```bash
npm test            # unit tests: formatting, validation, sessions, throttling, storage client
npm run typecheck
npm run build       # production build
```

### 5.4 Create a Git repository and push to GitHub
```bash
git init
git add .
git commit -m "Live market rate system"
```
Create an empty **private** repository on GitHub (no README), then:
```bash
git remote add origin https://github.com/<your-account>/staticrateupdater.git
git branch -M main
git push -u origin main
```
Check on GitHub that `.env.local` was **not** uploaded.

### 5.5 Import into Vercel
1. Go to <https://vercel.com/new> and import the `staticrateupdater` repository.
2. The framework preset is detected as **Next.js**. Leave the build settings at their defaults.
3. The **project name** decides your permanent URL: `https://<project-name>.vercel.app`. Choose it carefully (e.g. `abc-traders-rate`).
4. Under **Environment Variables**, add `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` and (optionally) `BUSINESS_NAME`.
5. Click **Deploy**.

### 5.6 Connect the storage (Upstash Redis)
1. In the Vercel project, open the **Storage** tab, then **Create Database** → **Upstash** → **Upstash for Redis**.
2. Pick the **Free** plan and a primary region. **Mumbai (ap-south-1)** gives the fastest response for Indian customers, if offered.
3. Connect it to the project. Tick **Production** (and Preview/Development only if you are not using a separate test database).
4. Vercel adds `KV_REST_API_URL`, `KV_REST_API_TOKEN` and related variables automatically.

Optional speed-up: in Project → Settings → **Functions**, set the function region to **Mumbai (bom1)** to match the database.

### 5.7 Redeploy
Environment variables apply only to new deployments. Go to **Deployments**, open the latest one and choose **⋯ → Redeploy**. Alternatively, push any commit to `main`.

### 5.8 Test the admin login
Open `https://<project-name>.vercel.app/admin/login` and sign in with the username and password you set. Check that a wrong password is rejected and that `/admin` sends you to the login page when you are logged out.

### 5.9 Publish a rate
On the dashboard, type `15000`, check the preview (₹15,000), tap **Publish Rate** and then **Confirm**. A success message shows the rate and the time in IST.

### 5.10 Check from another device
On a different phone or browser, open `https://<project-name>.vercel.app/rate`. It shows ₹15,000. Publish `15550` from the admin phone, then tap **Refresh Rate** on the other device. It shows ₹15,550 with the new "Last Updated" time.

### 5.11 Share the permanent link
On the dashboard, tap **Share on WhatsApp** (section 3) and choose a contact, group or broadcast list. The message reads:

> Please check the latest market rate here: https://&lt;project-name&gt;.vercel.app/rate

Send it once, around 10:00 AM. The same link always shows the latest published rate.

The URL stays the same unless you rename or delete the Vercel project. No domain purchase is needed.

---

## 6. Daily use from an Android phone

**One-time setup.** Open `https://<project-name>.vercel.app/admin/login` in Chrome. Tap **⋮ → Add to Home screen** to get a one-tap icon, and let Chrome's password manager save the login.

**Every day**
1. **~10:00 AM:** Open the dashboard and tap **Share on WhatsApp** to send the link. Until you publish, customers see "Today's rate has not been published yet." If yesterday's rate is still published, the dashboard warns that it is not for today.
2. **~11:30 AM:** Open the dashboard (log in if asked; sessions last 8 hours).
3. Type the new rate in **Update Rate**, e.g. `15550`. Commas are fine if placed correctly (`15,550`). Check the **Preview** and the difference from the current rate.
4. Check the **Market date** (defaults to today in IST).
5. Tap **Publish Rate**, check the confirmation box and tap **Confirm**.
6. Wait for **"Rate published successfully"**. The "Current Published Rate" section reloads from the server. If an error appears instead, the old rate is still live, so try again.
7. Customers who open or refresh the original link now see the new rate. **Don't send another message.**
8. Tap **Log out** when finished, especially on a shared phone.

---

## 7. Testing checklist

| # | Check | How |
|---|---|---|
| 1 | Customer opens `/rate` without login | Incognito window |
| 2 | Customer cannot publish | `curl -X POST https://<app>/api/rate -H "Content-Type: application/json" -d '{"rate":1}'` → 403/401 |
| 3 | `/admin` blocked when logged out | Open `/admin` in incognito → redirected to login |
| 4 | Wrong credentials rejected | 6 wrong attempts → "Too many failed attempts" |
| 5 | Admin can log in | — |
| 6–7 | Publish ₹15,000 → `/rate` shows ₹15,000 | — |
| 8–10 | Publish ₹15,550 → stored → `/rate` shows it after Refresh | Also check `GET /api/rate` |
| 11 | Another phone shows ₹15,550 | Mobile data, not Wi-Fi |
| 12 | Timestamp is the real IST time | Compare with your phone clock |
| 13 | Failed write keeps the old rate | Covered by `npm test` (simulated outage) |
| 14 | Logout works, and the old cookie is rejected | After logout, `/admin` → login page |
| 15 | Mobile and desktop layouts | Chrome DevTools device mode + a real Android phone |
| 16 | Production build succeeds | `npm run build` |
| 17 | No secrets in client code | After a build, `findstr /s /i "ADMIN_PASSWORD KV_REST_API_TOKEN" .next\static\*` (macOS/Linux: `grep -r ... .next/static`) → no matches |

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Login is not available yet…" | `ADMIN_USERNAME`, `ADMIN_PASSWORD` or `SESSION_SECRET` is missing, or the secret is under 32 characters. Set it in Vercel and **redeploy**. |
| "The server is not available right now" / "Dashboard unavailable" | Upstash is not connected, or the `KV_REST_*` variables are missing. Check the Storage tab, then redeploy. |
| Customers report an old rate | Ask them to tap **Refresh Rate**. Check that `GET /api/rate` shows the new value. Responses are never cached by the app. |
| Logged out unexpectedly | Sessions expire after 8 hours. Changing `SESSION_SECRET` also logs everyone out. |
| WhatsApp link preview shows an old title | WhatsApp caches previews. The rate itself is deliberately not in the preview, so this doesn't matter. |

---

## 9. Later: rate history (optional)

Version 1 keeps only the current record. To add history without a database, push each published record onto a capped Redis list in `publishRate()` (`LPUSH market-rate:history <json>` then `LTRIM market-rate:history 0 89` keeps 90 entries). The basic workflow does not change.
