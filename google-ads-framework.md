# EastXperience — Google Ads Framework for Claude

## Quick Setup: Connect Claude to Google Ads Live Data

### Option A — Windsor.ai MCP (Recommended, no code)
1. Go to [windsor.ai](https://windsor.ai) → Connect Google Ads
2. In Claude Code settings, add Windsor MCP:
   ```json
   {
     "mcpServers": {
       "windsor": {
         "command": "npx",
         "args": ["-y", "@windsor-ai/mcp-server"],
         "env": { "WINDSOR_API_KEY": "your_key_here" }
       }
     }
   }
   ```
3. Claude can then pull live campaign data, search terms, and performance metrics directly.

### Option B — Google Ads API (full access)
1. Create a Google Cloud project → Enable Google Ads API
2. Generate OAuth2 credentials (Desktop app type)
3. Run `npx google-ads-api auth` to get your refresh token
4. Set env vars: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`

---

## Master Context Prompt (paste at start of every Claude session)

```
You are a senior Google Ads strategist for EastXperience, a premium travel brand 
selling Komodo sailing trips (3D2N, IDR 6.8M–9.5M/person) and other Indonesia 
adventure experiences to international travelers aged 22–40.

Brand voice: premium but not pretentious. Direct, confident, no fluff.
Target audience: independent travelers, digital nomads, young professionals from 
Europe, Australia, Singapore, USA. Booking intent is high — they've researched Komodo.

Primary conversion: WhatsApp lead (qualify) → booking deposit
Landing page: https://eastxperience.github.io/hellofromtheeast/komodo-sailing-3d2n-final.html

Current campaigns: [paste campaign names]
Monthly budget: [IDR / USD]
CPA target: IDR 250,000 per lead / IDR 1,500,000 per booking
```

---

## 1. Keyword Research & Negative Keyword Audit

### Prompt: Negative Keyword Identification

```
You are a senior Google Ads analyst specializing in waste reduction.

Analyze the search terms report below and identify:
1. Search terms with IDR 50,000+ spend and zero conversions
2. Search terms irrelevant to Komodo sailing / adventure travel (e.g. "komodo dragon pet", "komodo edit", "sailing school")
3. Search terms with CTR below 1% and 100+ impressions
4. Duplicate/overlapping terms cannibalizing each other
5. Branded competitor terms we should bid on separately (e.g. "liveaboard komodo", "kanawa island trip")

For each flagged term provide:
| Search Term | Spend | Impressions | Clicks | CTR | Why Negative | Match Type |
|---|---|---|---|---|---|---|

Sort by spend (highest first).

End with:
- Total recoverable spend/month
- Ready-to-import negative keyword list (one per line, with [exact], "phrase", or broad)
- Recommended new positive keywords discovered in high-converting terms

[PASTE SEARCH TERMS REPORT HERE — export from Google Ads → Keywords → Search Terms → Download]
```

### Prompt: Keyword Expansion

```
Based on these converting search terms for Komodo 3D2N sailing:
[paste top converting terms]

Suggest:
1. 15 high-intent long-tail keywords not yet in the account
2. 5 competitor/comparison keywords (e.g. "vs GetYourGuide komodo")
3. 10 audience-signal keywords (e.g. "solo travel indonesia 2025")
4. Seasonal modifiers for peak season Apr–Nov

Format as CSV: keyword, match type, estimated intent (high/med/low), suggested max CPC
```

---

## 2. RSA Ad Copy Generation

### Prompt: Generate RSA Headlines + Descriptions

```
Generate a complete Responsive Search Ad for EastXperience Komodo 3D2N Sailing.

CONSTRAINTS (strict — Google Ads limits):
- 15 headlines: MAX 30 characters each (count spaces)
- 4 descriptions: MAX 90 characters each
- Include keyword: "Komodo sailing" in at least 2 headlines
- Include price "IDR 6.8M" or "From $418" in 1 headline
- Include CTA in at least 2 headlines
- Descriptions must emphasize: direct booking savings, social group curation, all-inclusive

BRAND VOICE: confident, premium, no hype. Use active verbs. No exclamation marks.

Target keyword: [INSERT TARGET KEYWORD]
Landing page URL: https://eastxperience.github.io/hellofromtheeast/komodo-sailing-3d2n-final.html

After generating, annotate each headline with:
- Character count
- Pinning recommendation (Pin 1 / Pin 2 / Unpinned)
- What user need it addresses
```

### Prompt: Ad Copy Variants by Audience

```
Write 3 RSA headline sets (15 headlines each, max 30 chars) tailored to:

VARIANT A — Solo traveler (searches: "solo travel komodo", "komodo trip solo")
VARIANT B — Couple (searches: "komodo trip couple", "komodo romantic sailing")  
VARIANT C — Price-conscious (searches: "cheap komodo tour", "komodo budget sailing")

For each variant, adjust the emotional hook while keeping brand voice consistent.
Flag any headline under 20 chars — Google rewards longer headlines with better Ad Strength.
```

---

## 3. Campaign Analysis & Audit

### Prompt: Performance Max Asset Group Audit

```
Audit these Performance Max asset groups for EastXperience:

[PASTE PMAX ASSET GROUP PERFORMANCE DATA — from Google Ads → Campaigns → Asset Groups → Download]

For each asset group:
1. Identify assets rated "Low" performance
2. Suggest replacement copy following brand voice
3. Flag asset groups with Conv. Rate < [target]%
4. Recommend budget reallocation between asset groups
5. Identify audience signals that are underperforming

Output:
- Priority action table (asset group → issue → fix → expected impact)
- New asset copy ready to upload
- Budget reallocation recommendation with rationale
```

### Prompt: Account Health Check

```
Run a full account health audit on this Google Ads data:

[PASTE: Campaign performance report last 30 days — include: campaign, ad group, impressions, clicks, CTR, avg CPC, conversions, conv. rate, cost, ROAS]

Identify and prioritize:
1. Ad groups with Quality Score < 6 → root cause (ad relevance / landing page / expected CTR)
2. Keywords with CPC > IDR 15,000 and 0 conversions in 30 days → pause or bid-down list
3. Campaigns pacing over/under budget by >15%
4. Hour-of-day and day-of-week inefficiencies (if impression share data available)
5. Device performance gaps (mobile vs desktop conversion rate delta)

Output as executive summary + action table sorted by IDR impact.
```

### Prompt: Budget Pacing Projection

```
Today is [DATE]. Monthly budget: IDR [AMOUNT].
Days elapsed: [X]. Spend to date: IDR [AMOUNT].

Calculate:
1. Current daily spend rate
2. Projected month-end spend
3. Over/under budget amount and percentage
4. If overpacing: which campaigns to reduce bids or budgets, by how much
5. If underpacing: which high-performing campaigns to scale, suggested budget increase

Include a day-by-day spend projection table for the rest of the month.
```

---

## 4. Conversion Tracking Setup

### Google Ads Conversion Actions to Create

| Conversion Name | Category | Count | Value |
|---|---|---|---|
| Date Selected | Page View | Every | IDR 50,000 (micro) |
| Cabin Selected | Page View | Every | IDR 100,000 (micro) |
| Lead Form Submit | Lead | Every | IDR 500,000 |
| WhatsApp Open | Lead | Every | IDR 300,000 |
| Booking Deposit | Purchase | Every | Dynamic (cabin price) |

### Implementation in Landing Page

The landing page already fires these via `gtag('event', ...)`. Replace placeholders:
- `AW-XXXXXXXX` → your Google Ads Conversion ID (from Tools → Conversions)
- `CONV_LABEL` → your lead conversion label

```javascript
// Already in komodo-sailing-3d2n-final.html — just replace the IDs:
gtag('event', 'conversion', {
  send_to: 'AW-XXXXXXXX/CONV_LABEL',
  value: 9500000 / 15000, // IDR to USD approx
  currency: 'USD'
});
```

---

## 5. Automated Scripts

### Script: Pause Keywords Over Spend Threshold

```javascript
// Google Ads Script — paste in Tools → Scripts
// Pauses keywords with spend > IDR 200,000 and 0 conversions in 30 days

function main() {
  const SPEND_THRESHOLD = 200000 / 15000; // Convert to USD for Google API
  const DATE_RANGE = 'LAST_30_DAYS';
  const report = AdsApp.report(
    `SELECT AdGroupCriterion.Keyword.Text, Metrics.CostMicros, Metrics.Conversions
     FROM keyword_view
     WHERE Metrics.CostMicros > ${SPEND_THRESHOLD * 1000000}
     AND Metrics.Conversions = 0
     DURING ${DATE_RANGE}`
  );
  const rows = report.rows();
  let paused = 0;
  while (rows.hasNext()) {
    const row = rows.next();
    // Log only — remove comment below to auto-pause
    Logger.log(`Would pause: ${row['AdGroupCriterion.Keyword.Text']} — Cost: ${row['Metrics.CostMicros']}`);
    // row.getAdGroupCriterion().pause(); // UNCOMMENT TO ACTIVATE
    paused++;
  }
  Logger.log(`Found ${paused} keywords to review.`);
}
```

### Script: CPA Anomaly Detection

```javascript
// Fires an email alert when CPA shifts > 30% vs. prior 7-day average

function main() {
  const EMAIL = 'hello@eastxperience.com';
  const CPA_THRESHOLD_PERCENT = 30;

  const thisWeek = getMetrics('LAST_7_DAYS');
  const lastWeek = getMetrics('LAST_14_DAYS'); // Google uses rolling windows

  if (thisWeek.conversions === 0) return;
  const thisCPA  = thisWeek.cost / thisWeek.conversions;
  const lastCPA  = lastWeek.cost / Math.max(lastWeek.conversions, 1);
  const delta    = ((thisCPA - lastCPA) / lastCPA) * 100;

  if (Math.abs(delta) > CPA_THRESHOLD_PERCENT) {
    const dir = delta > 0 ? 'INCREASED' : 'DECREASED';
    MailApp.sendEmail(EMAIL,
      `⚠️ Google Ads CPA ${dir} ${Math.abs(delta).toFixed(1)}%`,
      `CPA this week: $${thisCPA.toFixed(2)}\nCPA last week: $${lastCPA.toFixed(2)}\nDelta: ${delta.toFixed(1)}%\n\nCheck account immediately.`
    );
  }
}

function getMetrics(dateRange) {
  const report = AdsApp.report(
    `SELECT Metrics.CostMicros, Metrics.Conversions FROM customer DURING ${dateRange}`
  );
  const row = report.rows().next();
  return {
    cost: row['Metrics.CostMicros'] / 1000000,
    conversions: Number(row['Metrics.Conversions'])
  };
}
```

---

## 6. Campaign Structure Recommendation (EastXperience)

```
Campaign 1: Komodo Sailing — High Intent [Search]
  Ad Group 1a: "komodo sailing trip" [Exact + Phrase]
  Ad Group 1b: "komodo liveaboard" [Exact + Phrase]
  Ad Group 1c: "labuan bajo boat trip" [Broad Match + Smart Bidding]

Campaign 2: Komodo Sailing — Competitor Conquest [Search]
  Ad Group 2a: GetYourGuide/Klook alternatives
  Ad Group 2b: Competitor brand names (with permission)

Campaign 3: Komodo Sailing — Performance Max
  Asset Group A: Solo Travelers
  Asset Group B: Couples
  Asset Group C: Remarketing (visited page, didn't convert)

Campaign 4: Remarketing — Past Visitors [Display/YT]
  Audience: Visited /komodo-sailing-3d2n in last 30 days
  Message: "Still thinking about Komodo? 3 cabins left this Friday."
```

---

## 7. Google Sheets Availability Setup

For the live booking calendar on the landing page, structure your Google Sheet (gid=471938885) with these column headers — **exact spelling matters**:

| Date | Available Spots | Status |
|------|----------------|--------|
| 2026-05-05 | 12 | available |
| 2026-05-07 | 4 | limited |
| 2026-05-09 | 0 | full |

- **Date**: ISO format `YYYY-MM-DD` or Google Sheets Date format
- **Available Spots**: number (0–12)
- **Status**: `available` / `limited` / `full` (auto-detected if missing — based on spots count)
- Sheet must be: **Share → Anyone with the link → Viewer**

The landing page fetches this every page load via the Google Visualization API (no API key needed for public sheets).
