/**
 * ═════════════════════════════════════════════════════════════════
 *  KANHA FLEET — LIVE AVAILABILITY API
 *  Google Apps Script Web App
 *  Source: https://docs.google.com/spreadsheets/d/1IdDDGaVjmNG1XOdQEb3tm-g4d9hBgTiydm8TDOSuNQA
 * ═════════════════════════════════════════════════════════════════
 *
 *  ROLE
 *  ----
 *  Reads the master booking sheet, parses cell text + background color,
 *  normalizes the data into 8 public statuses, and returns sanitized
 *  JSON to the public website calendar.
 *
 *  DEPLOYMENT
 *  ----------
 *  1. Open https://script.google.com → New project
 *  2. Paste this entire file → Save
 *  3. Project Settings → set timezone to "Asia/Makassar"
 *  4. Deploy → New deployment → type: Web app
 *     - Execute as: Me (the spreadsheet owner)
 *     - Who has access: Anyone
 *  5. Authorize → copy the Web App URL
 *  6. Paste URL into kanha-liveaboard-booking.html → AVAILABILITY_API_URL
 *
 *  SECURITY
 *  --------
 *  • No service-account credentials in this file.
 *  • Output is sanitized — guest names, phone numbers, payment notes,
 *    and internal codes are stripped before JSON is returned.
 *  • Apps Script runs as the spreadsheet owner; public callers only
 *    receive the sanitized JSON.
 *
 *  CACHING
 *  -------
 *  • CacheService caches the response for 5 minutes (300 s).
 *  • Frontend uses fetch(..., { cache: "no-store" }) so the server-side
 *    5-minute cache is the only level. Admin edits become visible
 *    within 5 minutes of saving the sheet.
 *  • Force-refresh: append ?refresh=1 to the Web App URL.
 */

/* ─────────────────────────────────────────────
   CONFIGURATION
───────────────────────────────────────────────── */
const SHEET_ID  = '1IdDDGaVjmNG1XOdQEb3tm-g4d9hBgTiydm8TDOSuNQA';
const SEASON    = 2026;
const TZ        = 'Asia/Makassar'; // GMT+8 (Labuan Bajo)
const CACHE_TTL = 300;             // 5 minutes

// Boat detection — finds section headers in the master sheet
const BOAT_CONFIG = [
  { id: 'kanha-loka',  name: 'Kanha Loka',  match: /kanha\s*loka/i,
    publicCabins: [
      { match: /share|sharing/i,                    name: 'Share Cabin',         capacity: '8 pax' },
      { match: /superior/i,                         name: 'Superior Cabin',      capacity: '2 pax' },
      { match: /family/i,                           name: 'Family Cabin',        capacity: '4 pax' },
      { match: /deluxe/i,                           name: 'Deluxe Ocean View',   capacity: '2 pax' },
      { match: /master/i,                           name: 'Master Ocean View',   capacity: '2 pax' }
    ]},
  { id: 'kanha-natha', name: 'Kanha Natha', match: /kanha\s*natha/i,
    publicCabins: [
      { match: /share|bunk/i,                       name: 'Share Cabin',         capacity: '8 pax' },
      { match: /private|ocean.*view|master/i,       name: 'Private Ocean View',  capacity: '2 pax' }
    ]},
  { id: 'kanha-citta', name: 'Kanha Citta', match: /kanha\s*citta/i,
    publicCabins: [
      { match: /share/i,                            name: 'Share Room',          capacity: '8 pax' },
      { match: /deluxe/i,                           name: 'Deluxe Ocean View',   capacity: '2 pax' },
      { match: /shakti|sedana/i,                    name: 'Shakti / Sedana',     capacity: '2 pax' },
      { match: /gayatri|master/i,                   name: 'Gayatri Master Suite',capacity: '2 pax' }
    ]}
];

const MNAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];

/* ─────────────────────────────────────────────
   ENTRY POINT
───────────────────────────────────────────────── */
function doGet(e) {
  try {
    const refresh = e && e.parameter && e.parameter.refresh === '1';
    const cache = CacheService.getScriptCache();
    if (!refresh) {
      const cached = cache.get('availability_v1');
      if (cached) return jsonOut(JSON.parse(cached));
    }
    const payload = buildAvailabilityPayload();
    cache.put('availability_v1', JSON.stringify(payload), CACHE_TTL);
    return jsonOut(payload);
  } catch (err) {
    return jsonOut({
      ok: false,
      error: 'parse_error',
      message: String(err && err.message || err),
      lastUpdated: new Date().toISOString(),
      season: SEASON,
      boats: []
    });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ─────────────────────────────────────────────
   PAYLOAD BUILDER
───────────────────────────────────────────────── */
function buildAvailabilityPayload() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = pickScheduleSheet(ss);
  if (!sheet) throw new Error('No schedule sheet found');

  const range  = sheet.getDataRange();
  const values = range.getValues();
  const bgs    = range.getBackgrounds();
  const merged = (sheet.getMergedRanges && sheet.getMergedRanges()) || [];

  // Step 1 — find date headers (month + day rows)
  const dateMap = detectDateColumns(values);
  if (!dateMap.length) throw new Error('No date columns detected');

  // Step 2 — find boat sections
  const sections = detectBoatSections(values);

  // Step 3 — detect merged-range trip spans by row+col
  const mergedIndex = indexMergedRanges(merged);

  // Step 4 — build departures per boat
  const boats = sections.map(sec => {
    const boatId = sec.boatId;
    const cfg    = BOAT_CONFIG.find(b => b.id === boatId);
    if (!cfg) return null;

    const cabinRows = mapCabinRows(values, sec, cfg);
    const departures = buildDeparturesForBoat({
      values, bgs, mergedIndex, dateMap, cabinRows, cfg
    });

    return {
      id:   cfg.id,
      name: cfg.name,
      departures
    };
  }).filter(Boolean);

  return {
    ok: true,
    lastUpdated: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    season: SEASON,
    boats
  };
}

/* ─────────────────────────────────────────────
   SHEET PICKER — tries the gid, then by name
───────────────────────────────────────────────── */
function pickScheduleSheet(ss) {
  // 1. By gid 471938885
  const sheets = ss.getSheets();
  for (const s of sheets) {
    if (s.getSheetId && s.getSheetId() === 471938885) return s;
  }
  // 2. By name patterns
  const namePatterns = [/booking\s*chart\s*2026/i, /schedule\s*2026/i, /2026/];
  for (const pat of namePatterns) {
    const hit = sheets.find(s => pat.test(s.getName()));
    if (hit) return hit;
  }
  // 3. Fallback to first sheet
  return sheets[0] || null;
}

/* ─────────────────────────────────────────────
   STEP 1 — DETECT DATE COLUMNS
   Strategy:
     • Find the row with the most month words → "monthRow"
     • Read the row immediately below as day numbers (1–31)
     • Map column index → ISO date YYYY-MM-DD
───────────────────────────────────────────────── */
function detectDateColumns(values) {
  let monthRowIdx = -1, monthRowHits = 0;
  for (let r = 0; r < Math.min(values.length, 12); r++) {
    let hits = 0;
    for (let c = 0; c < values[r].length; c++) {
      const txt = String(values[r][c] || '').toLowerCase().trim();
      if (MNAMES.indexOf(txt) >= 0 || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(txt)) hits++;
    }
    if (hits > monthRowHits) { monthRowHits = hits; monthRowIdx = r; }
  }
  if (monthRowIdx < 0) return [];

  // Build column → month map: month label spans multiple columns until the next month
  const months = [];
  let curMonth = -1;
  for (let c = 0; c < values[monthRowIdx].length; c++) {
    const cellTxt = String(values[monthRowIdx][c] || '').toLowerCase().trim();
    const found = MNAMES.findIndex(m => cellTxt && (m === cellTxt || m.startsWith(cellTxt) || cellTxt.startsWith(m.slice(0,3))));
    if (found >= 0) curMonth = found;
    months[c] = curMonth;
  }

  // Day row = next row OR same row if numeric in cell
  const dayRowIdx = monthRowIdx + 1 < values.length ? monthRowIdx + 1 : monthRowIdx;
  const dateMap = [];
  for (let c = 0; c < values[dayRowIdx].length; c++) {
    const dayVal = values[dayRowIdx][c];
    let day = null;
    if (dayVal instanceof Date) day = dayVal.getDate();
    else if (typeof dayVal === 'number' && dayVal >= 1 && dayVal <= 31) day = dayVal;
    else {
      const m = String(dayVal || '').match(/^(\d{1,2})/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 31) day = n;
      }
    }
    const monthIdx = months[c];
    if (day != null && monthIdx >= 0) {
      dateMap.push({
        col: c,
        date: `${SEASON}-${String(monthIdx+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      });
    }
  }
  return dateMap;
}

/* ─────────────────────────────────────────────
   STEP 2 — DETECT BOAT SECTIONS
   Strategy:
     • Scan column A for boat names
     • Each match → section starts at row+1, ends at the next match (or EOF)
───────────────────────────────────────────────── */
function detectBoatSections(values) {
  const sections = [];
  for (let r = 0; r < values.length; r++) {
    const txt = String(values[r][0] || '').trim();
    for (const cfg of BOAT_CONFIG) {
      if (cfg.match.test(txt)) {
        sections.push({ boatId: cfg.id, headerRow: r, startRow: r+1 });
        break;
      }
    }
  }
  // Determine endRow per section
  for (let i = 0; i < sections.length; i++) {
    sections[i].endRow = (i+1 < sections.length) ? sections[i+1].headerRow - 1 : values.length - 1;
  }
  return sections;
}

/* ─────────────────────────────────────────────
   STEP 3 — INDEX MERGED RANGES (for 3D2N spans)
───────────────────────────────────────────────── */
function indexMergedRanges(merged) {
  // Map "r,c" → { startCol, numCols } for merged horizontal ranges
  const idx = {};
  for (const m of merged) {
    if (!m.getNumColumns || !m.getNumRows) continue;
    const numCols = m.getNumColumns();
    const numRows = m.getNumRows();
    if (numCols < 2) continue; // 1-cell or vertical-only
    const r0 = m.getRow() - 1;     // to 0-index
    const c0 = m.getColumn() - 1;
    for (let r = r0; r < r0 + numRows; r++) {
      for (let c = c0; c < c0 + numCols; c++) {
        idx[r + ',' + c] = { startCol: c0, numCols, ownerRow: r0, ownerCol: c0 };
      }
    }
  }
  return idx;
}

/* ─────────────────────────────────────────────
   STEP 4 — MAP CABIN ROWS WITHIN A BOAT SECTION
───────────────────────────────────────────────── */
function mapCabinRows(values, sec, cfg) {
  const rows = [];
  for (let r = sec.startRow; r <= sec.endRow; r++) {
    const label = String(values[r][0] || '').trim();
    if (!label) continue;
    const cabin = cfg.publicCabins.find(c => c.match.test(label));
    if (cabin) {
      rows.push({ row: r, cabin: cabin, rawLabel: label });
    }
  }
  return rows;
}

/* ─────────────────────────────────────────────
   STEP 5 — BUILD DEPARTURES FOR ONE BOAT
   Strategy:
     • For each date column, look at the cabin rows
     • A "departure" exists at column C if:
         – any cabin row has merged-3-col span starting at C, OR
         – the cell at C contains "OT" or other departure marker, OR
         – we use a fallback: every Nth column in the date map (mod 3)
       (if no merge, no OT, just dates: skip — we should not invent)
     • For a detected departure, compute endDate = +2 days
     • Read each cabin's cell at column C → status
     • Aggregate to departure-level status
───────────────────────────────────────────────── */
function buildDeparturesForBoat({ values, bgs, mergedIndex, dateMap, cabinRows, cfg }) {
  const departures = [];
  const seenDates = {};

  for (const dm of dateMap) {
    const c = dm.col;
    const date = dm.date;

    // Skip dates outside SEASON
    if (!date.startsWith(SEASON + '-')) continue;
    if (seenDates[date]) continue;

    // Determine if a departure starts at this column
    const isDep = isDepartureColumn({ values, mergedIndex, cabinRows, c });
    if (!isDep) continue;

    seenDates[date] = true;

    // Read cabins
    const cabinsOut = cabinRows.map(cr => {
      const cellTxt = String(values[cr.row][c] || '').trim();
      const cellBg  = bgs[cr.row][c] || '#FFFFFF';
      const status  = classifyCell(cellTxt, cellBg);
      const sanitizedNote = sanitizeNote(status, cellTxt);
      const availableSpots = computeAvailableSpots(status, cr.cabin.capacity, cellTxt);
      return {
        id: slugify(cr.cabin.name),
        name: cr.cabin.name,
        capacity: cr.cabin.capacity,
        status: status,
        availableSpots: availableSpots,
        publicNote: sanitizedNote
      };
    });

    const aggregateStatus = aggregateDepartureStatus(cabinsOut, values, c, cabinRows);
    const endDate = addDays(date, 2);
    const availableCount = cabinsOut.filter(x => x.status === 'available' || x.status === 'limited').length;

    departures.push({
      departureDate: date,
      endDate: endDate,
      duration: '3D2N',
      status: aggregateStatus,
      statusLabel: prettyStatus(aggregateStatus),
      availableCabinsCount: availableCount,
      totalCabinsCount: cabinsOut.length,
      cabins: cabinsOut
    });
  }

  // Sort ascending by departureDate
  departures.sort((a, b) => a.departureDate.localeCompare(b.departureDate));
  return departures;
}

/* ─────────────────────────────────────────────
   isDepartureColumn — true if this col starts a 3D2N
───────────────────────────────────────────────── */
function isDepartureColumn({ values, mergedIndex, cabinRows, c }) {
  // 1. If any cabin row has a merged horizontal span starting EXACTLY at c → departure
  for (const cr of cabinRows) {
    const m = mergedIndex[cr.row + ',' + c];
    if (m && m.ownerCol === c && m.numCols >= 2) return true;
  }
  // 2. If header row above the boat has "OT" or an "open trip" tag at c
  for (const cr of cabinRows) {
    // Look 1-2 rows above the cabin row for OT marker
    for (let dr = -3; dr <= -1; dr++) {
      const rr = cr.row + dr;
      if (rr < 0) continue;
      const txt = String(values[rr][c] || '').trim().toLowerCase();
      if (/\bot\b|open\s*trip|departure/.test(txt)) return true;
    }
  }
  // 3. If at least one cabin cell at this column has *content* AND the immediately
  //    preceding column for that cabin is empty/blank → likely a fresh departure block
  let contentHere = false, contentBefore = false;
  for (const cr of cabinRows) {
    const txt = String(values[cr.row][c] || '').trim();
    if (txt) contentHere = true;
    if (c > 0) {
      const prev = String(values[cr.row][c-1] || '').trim();
      if (prev) contentBefore = true;
    }
  }
  if (contentHere && !contentBefore) return true;
  return false;
}

/* ─────────────────────────────────────────────
   CLASSIFY CELL — combines text + color → 1 of 8 statuses
───────────────────────────────────────────────── */
function classifyCell(text, bg) {
  const textStatus = textToStatus(text);
  if (textStatus) return textStatus;
  const colorStatus = colorToStatus(bg);
  return colorStatus;
}

function textToStatus(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().trim();
  if (!t) return null;

  // Maintenance / not-operating
  if (/\b(cancel|cancelled|not\s*operat)/.test(t)) return 'not_operating';
  if (/\b(dock|docking|maintenance|perawatan|tidak\s*trip)/.test(t)) return 'maintenance';

  // Private / charter
  if (/\b(private|charter|full\s*boat|corporate|incentive)\b/.test(t)) return 'private_charter';
  if (/\b\d{2,3}\s*pax\b/.test(t) && /(group|charter|incentive|private)/.test(t)) return 'private_charter';

  // OT marker only — not a status
  if (/^ot\.?$/.test(t)) return null;

  // On hold
  if (/^(hold|on\s*hold|tentative|wait|waiting|pending)\b/.test(t)) return 'on_hold';

  // Limited (partial-availability indicators)
  if (/\bavail.*\d+\s*pax\b/.test(t)) return 'limited';
  if (/\bavail.*(female|male|boy|girl|cow|cew)\b/.test(t)) return 'limited';
  if (/\bavail\s*1\s*pax\b/.test(t)) return 'limited';

  // Booked indicators
  if (/^(booked|confirmed|paid|full|sold)\b/.test(t)) return 'booked';
  if (/\bby\s+\w+/.test(t)) return 'booked';
  // Code prefixes followed by content → booked
  if (/^(dk|kl|kc|kn|seb|by)\s*[\w\-\.\d]/.test(t)) return 'booked';

  // If cell has substantial alpha content → likely a guest/agent name → booked
  // (but small abbreviations like "A", "B" are not enough)
  const alpha = t.replace(/[^a-z]/g, '');
  if (alpha.length >= 3) return 'booked';

  return null;
}

function colorToStatus(rgb) {
  if (!rgb) return 'available';
  const hex = String(rgb).replace('#','').toLowerCase();
  if (hex.length < 6) return 'available';
  const r = parseInt(hex.substr(0,2),16);
  const g = parseInt(hex.substr(2,2),16);
  const b = parseInt(hex.substr(4,2),16);
  // White / near-white
  if (r > 240 && g > 240 && b > 240) return 'available';
  // Red dominant
  if (r > 180 && g < 130 && b < 130) return 'booked';
  // Orange (high red, mid green, low blue)
  if (r > 220 && g > 110 && g < 200 && b < 110) return 'on_hold'; // orange → on_hold by default
  // Yellow (high red, high green, low blue)
  if (r > 220 && g > 200 && b < 130) return 'on_hold';
  // Light grey / blank
  if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && r > 200) return 'available';
  // Anything else dim → unknown
  return 'available';
}

/* ─────────────────────────────────────────────
   AGGREGATION
───────────────────────────────────────────────── */
function aggregateDepartureStatus(cabins, values, col, cabinRows) {
  if (!cabins.length) return 'unknown';
  // Check for boat-wide markers in the header rows above this column
  for (const cr of cabinRows) {
    for (let dr = -4; dr <= -1; dr++) {
      const rr = cr.row + dr;
      if (rr < 0) continue;
      const txt = String((values[rr] && values[rr][col]) || '').toLowerCase();
      if (/\b(private|charter|full\s*boat|corporate|incentive)\b/.test(txt)) return 'private_charter';
      if (/\b(dock|docking|maintenance|perawatan|tidak\s*trip)/.test(txt))   return 'maintenance';
      if (/\b(cancel|not\s*operat)/.test(txt))                                return 'not_operating';
    }
  }
  const counts = { available:0, limited:0, on_hold:0, booked:0, private_charter:0, maintenance:0, not_operating:0, unknown:0 };
  cabins.forEach(c => counts[c.status] = (counts[c.status]||0) + 1);

  if (counts.private_charter > 0) return 'private_charter';
  if (counts.maintenance > 0)     return 'maintenance';
  if (counts.not_operating > 0)   return 'not_operating';

  const total = cabins.length;
  if (counts.booked === total)    return 'booked';
  if (counts.on_hold === total)   return 'on_hold';
  if (counts.available === total) return 'available';
  if (counts.available > 0 && (counts.booked + counts.on_hold + counts.limited) > 0) return 'limited';
  if (counts.limited > 0)         return 'limited';
  if (counts.on_hold > 0)         return 'on_hold';
  if (counts.booked > 0)          return 'limited';
  return 'unknown';
}

/* ─────────────────────────────────────────────
   SANITIZATION
───────────────────────────────────────────────── */
function sanitizeNote(status, cellText) {
  // Public-friendly note. Never expose guest names, phone, payment, agent codes.
  switch (status) {
    case 'available':       return 'Available';
    case 'limited':         return 'Limited spots available';
    case 'on_hold':         return 'On hold — please confirm with our team';
    case 'booked':          return 'Booked';
    case 'private_charter': return 'Private charter';
    case 'maintenance':     return 'Maintenance';
    case 'not_operating':   return 'Not operating';
    case 'unknown':         return 'Please confirm with our team';
    default:                return 'Please confirm with our team';
  }
}

function computeAvailableSpots(status, capacity, cellText) {
  if (status === 'booked' || status === 'private_charter' || status === 'maintenance' || status === 'not_operating') return 0;
  if (status === 'on_hold') return 0;
  // Try to extract "avail N pax" text
  const m = String(cellText||'').toLowerCase().match(/avail\D*(\d+)\s*pax/);
  if (m) return parseInt(m[1],10);
  // Default: derive from capacity
  const cap = parseInt(String(capacity).match(/\d+/) || ['0'], 10);
  if (status === 'available') return cap || null;
  if (status === 'limited')   return Math.max(1, Math.floor((cap||2)/2));
  return null;
}

function prettyStatus(s) {
  return ({
    available: 'Available',
    limited: 'Limited',
    on_hold: 'On hold',
    booked: 'Booked',
    private_charter: 'Private charter',
    maintenance: 'Maintenance',
    not_operating: 'Not operating',
    unknown: 'Confirm with team'
  })[s] || 'Confirm with team';
}

/* ─────────────────────────────────────────────
   UTILS
───────────────────────────────────────────────── */
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m-1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return Utilities.formatDate(dt, 'UTC', 'yyyy-MM-dd');
}

function slugify(s) {
  return String(s||'').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ═════════════════════════════════════════════════════════════════
   OPTIONAL — TIDY-TAB FALLBACK
   If the master sheet is too irregular to parse reliably, you can
   create a separate hidden tab named "API_FEED" with this layout:

     boat_id      | departure_date | end_date  | cabin_id      | cabin_name        | capacity | status         | note
     kanha-loka   | 2026-05-15     | 2026-05-17| share-cabin   | Share Cabin       | 8 pax    | available      |
     kanha-loka   | 2026-05-15     | 2026-05-17| superior-cabin| Superior Cabin    | 2 pax    | booked         |
     ...

   Then call buildAvailabilityFromTidyTab() instead of buildAvailabilityPayload().
   This is helpful as a safety valve while the main parser is being tuned.
═════════════════════════════════════════════════════════════════ */
function buildAvailabilityFromTidyTab() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName('API_FEED');
  if (!sh) throw new Error('API_FEED tab not found');
  const data = sh.getDataRange().getValues();
  const header = data.shift();
  const idx = (k) => header.findIndex(h => String(h).toLowerCase().trim() === k);
  const cBoat = idx('boat_id'), cDep = idx('departure_date'), cEnd = idx('end_date');
  const cCabId = idx('cabin_id'), cCabName = idx('cabin_name'), cCap = idx('capacity');
  const cStat = idx('status');
  const groups = {};
  for (const row of data) {
    const boatId = String(row[cBoat]||'').trim();
    const dep    = formatDateLike(row[cDep]);
    if (!boatId || !dep) continue;
    const key = boatId + '|' + dep;
    if (!groups[key]) {
      groups[key] = {
        boatId, departureDate: dep,
        endDate: formatDateLike(row[cEnd]) || addDays(dep, 2),
        cabins: []
      };
    }
    const status = String(row[cStat]||'available').toLowerCase().trim();
    groups[key].cabins.push({
      id: String(row[cCabId]||'').trim() || slugify(row[cCabName]),
      name: String(row[cCabName]||'').trim(),
      capacity: String(row[cCap]||'').trim(),
      status,
      availableSpots: computeAvailableSpots(status, row[cCap], ''),
      publicNote: sanitizeNote(status, '')
    });
  }
  const boatMap = {};
  Object.values(groups).forEach(g => {
    if (!boatMap[g.boatId]) boatMap[g.boatId] = [];
    const aggregateStatus = aggregateDepartureStatus(g.cabins, [[]], 0, []);
    const availableCount = g.cabins.filter(x => x.status === 'available' || x.status === 'limited').length;
    boatMap[g.boatId].push({
      departureDate: g.departureDate,
      endDate: g.endDate,
      duration: '3D2N',
      status: aggregateStatus,
      statusLabel: prettyStatus(aggregateStatus),
      availableCabinsCount: availableCount,
      totalCabinsCount: g.cabins.length,
      cabins: g.cabins
    });
  });
  const boats = BOAT_CONFIG
    .filter(b => boatMap[b.id])
    .map(b => ({ id: b.id, name: b.name, departures: boatMap[b.id].sort((x,y) => x.departureDate.localeCompare(y.departureDate)) }));
  return {
    ok: true,
    lastUpdated: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    season: SEASON,
    boats,
    source: 'tidy_tab'
  };
}

function formatDateLike(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  return '';
}

/* ─────────────────────────────────────────────
   DEBUG ENDPOINTS (visit ?debug=1, ?debug=raw, ?debug=tidy)
───────────────────────────────────────────────── */
function debugDoGet(e) {
  const mode = e && e.parameter && e.parameter.debug;
  if (mode === 'tidy')  return jsonOut(buildAvailabilityFromTidyTab());
  if (mode === 'raw') {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = pickScheduleSheet(ss);
    return jsonOut({
      sheetName: sheet.getName(),
      sheetId:   sheet.getSheetId(),
      lastRow:   sheet.getLastRow(),
      lastCol:   sheet.getLastColumn(),
      sampleA1A20: sheet.getRange('A1:Z20').getValues()
    });
  }
  return doGet(e);
}
