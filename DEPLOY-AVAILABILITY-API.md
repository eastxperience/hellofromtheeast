# Deploy the Live Availability API — Kanha Fleet

This guide deploys the read-only Google Apps Script Web App that powers the live calendar on `kanha-liveaboard-booking.html`.

**Time to deploy:** ~10 minutes
**Result:** the website calendar fetches live availability from your Google Sheet. Admin edits become visible within 5 minutes.

---

## What you'll deploy

```
Browser → kanha-liveaboard-booking.html
            ↓ fetch(AVAILABILITY_API_URL)
          Google Apps Script Web App  (runs as YOU, the sheet owner)
            ↓ SpreadsheetApp.openById()
          KANHA NATHA/LOKA/CITTA SCHEDULE 2026
```

The Apps Script reads the master sheet, parses cell text and background colors, normalizes everything into 8 public statuses, sanitizes guest names / phone numbers / payment notes, and returns a JSON payload. The browser never reads the sheet directly.

---

## Step 1 — Create the Apps Script project

1. Open [https://script.google.com](https://script.google.com) → click **+ New project**.
2. Rename the project to `Kanha Availability API`.
3. Delete the default `Code.gs` content.
4. Open `apps-script-availability-api.gs` from this repo, copy the **entire** file, paste into `Code.gs`.
5. **File → Project Settings:**
   - Time zone: `Asia/Makassar` (GMT+8 — Labuan Bajo)
   - Show "appsscript.json" manifest file in editor: ✅ enable
6. Save (⌘S / Ctrl+S).

---

## Step 2 — Authorize access to the spreadsheet

1. In the script editor, run the function `doGet` once manually:
   - Select function dropdown → `doGet` → click **Run**.
2. You'll be prompted to authorize. Click **Review permissions** → choose your Google account → **Advanced → Go to Kanha Availability API (unsafe)** → **Allow**.
3. The script needs only one scope: `https://www.googleapis.com/auth/spreadsheets.currentonly` (read-only access to the sheet you opened by ID).

---

## Step 3 — Deploy as Web App

1. Top right → **Deploy → New deployment**.
2. Click the gear icon → **Web app**.
3. Configure:
   - **Description:** `Kanha Availability API v1`
   - **Execute as:** `Me (your-email@gmail.com)` ← important: runs as the sheet owner
   - **Who has access:** `Anyone`  ← required for public site to fetch
4. Click **Deploy**.
5. Copy the **Web app URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycb…/exec
   ```

> ⚠️ Do NOT confuse the "Web app URL" with the "Library" or "API executable" URL. You want the one ending in `/exec`.

---

## Step 4 — Connect the website

Open `kanha-liveaboard-booking.html` and find this line near the top of the `<script>`:

```js
const AVAILABILITY_API_URL = "PASTE_DEPLOYED_APPS_SCRIPT_WEB_APP_URL_HERE";
```

Replace with your `/exec` URL:

```js
const AVAILABILITY_API_URL = "https://script.google.com/macros/s/AKfycb…/exec";
```

Commit, push to `main`, and GitHub Pages publishes automatically.

---

## Step 5 — Test in the browser

Open the deployed page:
```
https://eastxperience.github.io/hellofromtheeast/kanha-liveaboard-booking.html?product=sailing-3d2n
```

Expected:
- "Live data · last updated …" timestamp shows under the legend.
- Calendar dots reflect the actual sheet state.
- Clicking a 15 May 2026 trip shows: `Trip dates: 15–17 May 2026 · Duration: 3D2N`.
- Cabin list shows live status per cabin (Available / On Hold / Booked / etc.).

If you see "We are checking live availability. Please contact us on WhatsApp…" — the fetch failed. Check:
1. The URL ends in `/exec` (not `/dev`).
2. "Who has access" was set to **Anyone**.
3. Open the URL directly in a browser — you should see JSON.

---

## Step 6 — Roll out admin updates

When admin updates the spreadsheet (status, color, notes, new departure):

- Server cache: 5 minutes (CacheService).
- Browser: every page load fetches fresh (no client cache).
- Result: admin edits visible to public within 5 minutes.

To force-refresh immediately, append `?refresh=1` to the API URL once. The user-facing page also has a **↻ Refresh** button under the legend.

---

## Verifying status mapping (test cases)

The Apps Script normalizes sheet data into these 8 public statuses:

| Sheet condition | Public status |
|---|---|
| Cell empty / white background | `available` |
| Cell yellow background | `on_hold` |
| Cell red background | `booked` |
| Cell orange background | `on_hold` (treated cautiously) |
| Cell text matches `/^ot$/i` | open-trip marker (does NOT determine status) |
| Cell contains "hold", "tentative", "wait", "pending" | `on_hold` |
| Cell contains "avail 1 pax", "avail female", etc. | `limited` |
| Cell contains "booked", "confirmed", "paid", "full", "sold" | `booked` |
| Cell starts with `DK`, `KL`, `KC`, `KN`, `SEB`, `BY` + content | `booked` |
| Guest/agent name (≥3 alpha chars) | `booked` |
| Cell contains "private", "charter", "full boat", "corporate" | `private_charter` |
| Cell contains "dock", "maintenance", "perawatan", "tidak trip" | `maintenance` |
| Cell contains "cancel", "not operating" | `not_operating` |
| Cell ambiguous | `unknown` |

The departure status is computed from cabin rows:

| Condition | Departure status |
|---|---|
| All cabins available | `available` |
| Mix of available + booked/on_hold/limited | `limited` |
| All on_hold | `on_hold` |
| All booked | `booked` |
| Any private marker | `private_charter` |
| Any maintenance marker | `maintenance` |
| Any cancel/not-operating marker | `not_operating` |
| Cannot classify | `unknown` |

---

## Sanitization — what NEVER leaves the API

The Apps Script strips these before returning JSON:
- Guest full names / first names
- Phone numbers / emails
- Payment status / agent commission
- Internal booking codes (DK/KL/KC/KN prefixes, etc.)

Public notes the API may return:
- "Available"
- "Limited spots available"
- "On hold — please confirm with our team"
- "Booked"
- "Private charter"
- "Maintenance"
- "Not operating"
- "Please confirm with our team"

---

## Optional — Tidy-tab fallback

If the master sheet is too irregular for the auto-parser, add a hidden tab named `API_FEED` with this layout:

| boat_id | departure_date | end_date | cabin_id | cabin_name | capacity | status | note |
|---|---|---|---|---|---|---|---|
| kanha-loka | 2026-05-15 | 2026-05-17 | share-cabin | Share Cabin | 8 pax | available | |
| kanha-loka | 2026-05-15 | 2026-05-17 | superior-cabin | Superior Cabin | 2 pax | booked | |
| ... | ... | ... | ... | ... | ... | ... | |

Then in the Apps Script `doGet`, swap:
```js
const payload = buildAvailabilityPayload();
```
to:
```js
const payload = buildAvailabilityFromTidyTab();
```

The tidy tab can be populated automatically from the master sheet via `=ARRAYFORMULA(...)` — let your admin choose which approach is easier to maintain.

---

## Debug endpoints

While tuning the parser, append these to the Web App URL:

| URL suffix | Returns |
|---|---|
| `?refresh=1` | Bust the 5-min server cache, return fresh JSON |
| `?debug=raw` | Raw sheet sample A1:Z20 (only enable temporarily) |
| `?debug=tidy` | Force tidy-tab parser |

To enable the debug endpoint, change the deployment's `doGet` reference to `debugDoGet`. **Disable before going live.**

---

## Testing checklist

Run these before announcing the API is live:

| # | Test | Expected |
|---|---|---|
| 1 | Sheet shows 15–17 May 2026 trip | Only 15 May clickable |
| 2 | Click 15 May | Modal shows "Trip dates: 15–17 May 2026 · 3D2N" |
| 3 | Calendar dots on 16 May & 17 May | Striped travel-day style, not clickable |
| 4 | Loka has OT on 15 May, 1 cabin booked | Status: `limited`, dot color: olive-green |
| 5 | All Loka cabins red on a date | Status: `booked`, dot color: grey |
| 6 | Date marked "Private charter" | Status: `private_charter`, dot color: purple |
| 7 | Date marked "Docking" / "Maintenance" | Status: `maintenance`, dot color: slate |
| 8 | Admin changes 1 cabin from available → booked | Site updates within ≤5 min after refresh |
| 9 | API URL deliberately broken | Calendar shows error CTA → WhatsApp |
| 10 | Two boats depart same day | Two dots stacked on that date |
| 11 | Click date with all cabins booked | Modal opens but cabin grid shows all "Booked" + WA CTA still works |
| 12 | URL `?boat=loka&product=sailing-3d2n&month=2026-07` | Auto-selects Loka, jumps to July |

---

## Updating the script later

If you change the parser:
1. Edit `Code.gs` in the Apps Script editor.
2. Save.
3. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**.
4. The URL **stays the same** — no need to update the website.

---

## Security recap

- The Apps Script runs as you (the sheet owner) — only your browser session ever sees the raw sheet.
- "Anyone" access on the Web App means anyone can call the JSON endpoint, but they only see sanitized output.
- No service-account credentials, no API keys, no OAuth tokens in the static site.
- Guest data, phone numbers, payment notes, and internal codes never leave the script's runtime.

Sources:
- [KANHA NATHA/LOKA/CITTA SCHEDULE 2026 (source of truth)](https://docs.google.com/spreadsheets/d/1IdDDGaVjmNG1XOdQEb3tm-g4d9hBgTiydm8TDOSuNQA/edit?gid=471938885)
- [Apps Script Web Apps reference](https://developers.google.com/apps-script/guides/web)
