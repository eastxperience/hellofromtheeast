#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# EastXperience · index.html Start Planning CTA patcher
# ═══════════════════════════════════════════════════════════════
# Routes every "Start Planning" / "Plan My Journey" / "Build My Trip"
# CTA to ./plan.html while keeping all other WhatsApp deep links
# (e.g. per-experience "Plan This Trip") intact.
#
# Run from the repo root:
#   bash patch-start-planning.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="$DIR/index.html"

if [[ ! -f "$FILE" ]]; then
  echo "✗ index.html not found at $FILE"; exit 1
fi

BACKUP="$DIR/index.backup.$(date +%Y%m%d-%H%M%S).html"
cp "$FILE" "$BACKUP"
echo "✓ Backup saved: $(basename "$BACKUP")"

python3 - "$FILE" <<'PY'
import re, sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# ── Patterns to convert ───────────────────────────────────────
# We target anchors whose visible label contains one of:
#   Start Planning, Plan My Journey, Build My Trip
# and whose href points to wa.me. We rewrite the href to plan.html
# (relative) and add rel/aria polish. Per-experience "Plan This Trip",
# "Check Availability", "Get Custom Itinerary" etc. stay untouched.

LABEL_RE = re.compile(
    r'(<a\b[^>]*?\bhref=)(["\'])(https?://wa\.me/[^"\']+)\2([^>]*)>'
    r'([\s\S]*?)'
    r'(</a>)',
    re.IGNORECASE
)

TARGET_PHRASES = (
    'start planning',
    'plan my journey',
    'build my trip',
)

def should_convert(label_html: str) -> bool:
    text = re.sub(r'<[^>]+>', ' ', label_html).lower()
    return any(p in text for p in TARGET_PHRASES)

count = 0
def repl(m):
    global count
    pre, q, url, attrs, label, close = m.groups()
    if not should_convert(label):
        return m.group(0)
    count += 1
    # Preserve attrs, but drop target=_blank so the planner opens in-page
    attrs_clean = re.sub(r'\s+target=(["\'])[^"\']*\1', '', attrs, flags=re.I)
    attrs_clean = re.sub(r'\s+rel=(["\'])[^"\']*\1', '', attrs_clean, flags=re.I)
    return f'{pre}{q}plan.html{q}{attrs_clean}>{label}{close}'

html_new = LABEL_RE.sub(repl, html)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html_new)

print(f"✓ Rewrote {count} CTA link(s) → plan.html")
PY

echo ""
echo "── Verification ─────────────────────────────────────"
echo "Links now pointing to plan.html:"
grep -cE 'href=["\x27]plan\.html["\x27]' "$FILE" || true
echo ""
echo "Remaining wa.me links (should be per-experience CTAs only):"
grep -cE 'href=["\x27]https?://wa\.me' "$FILE" || true
echo ""
echo "✓ Done. Open index.html in a browser to test."
echo "  Backup kept at: $(basename "$BACKUP")"
