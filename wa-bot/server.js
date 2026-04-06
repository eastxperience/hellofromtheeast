/**
 * EastXperience WhatsApp Bot Server
 * Powered by Claude AI + Fonnte Gateway
 * Number: +62811342473
 *
 * Stack: Node.js + Express + Anthropic SDK
 * Deploy: Railway / Render (free tier)
 */

// ── CRASH GUARDS (must be first) ─────────────────────────
process.on('uncaughtException', (err) => {
  console.error('💥 uncaughtException:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('💥 unhandledRejection:', reason);
});

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── CONFIG ──────────────────────────────────────────────
const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;
const WA_NUMBER = '62811342473';

console.log(`⚙️  Config: PORT=${PORT}, FONNTE=${FONNTE_TOKEN ? '✅' : '❌'}, ANTHROPIC=${ANTHROPIC_KEY ? '✅' : '❌'}`);

// ── LAZY ANTHROPIC INIT ──────────────────────────────────
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    const { default: Anthropic } = require('@anthropic-ai/sdk');
    _anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  }
  return _anthropic;
}

// ── IN-MEMORY CONVERSATION STATE ───────────────────────
const conversations = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of conversations) {
    if (now - data.lastActive > 6 * 60 * 60 * 1000) {
      conversations.delete(phone);
    }
  }
}, 30 * 60 * 1000);

// ── EASTXPERIENCE SYSTEM PROMPT ─────────────────────────
const SYSTEM_PROMPT = `You are Kirana, a booking agent for EastXperience — a premium experiential travel brand based in Labuan Bajo, Komodo National Park, operated by PT. Salam Dari Timur.

IDENTITY:
- Your name: Kirana
- You are warm, knowledgeable, and conversational — like a well-traveled friend who knows this region deeply.
- Never stiff or formal. No "Dengan Hormat" or "Dear Sir/Madam".
- You genuinely love what you do and it shows.

LANGUAGE RULES (critical):
- Detect the guest's language from their FIRST message and stick with it throughout.
- Guest writes in English → reply in English only.
- Guest writes in Indonesian → reply in Indonesian only.
- Guest mixes both → follow whichever language dominates.
- Never switch language mid-conversation unless the guest does first.

HOW TO GREET (very important):
- When someone says hi/hello/halo or any greeting, DO NOT immediately push a numbered sales menu.
- Instead, greet them warmly and ask what they're planning or what brought them here.
- Make it feel like a conversation, not a brochure.
- Good example (Indonesian): "Halo! Lagi ngerencanain trip ke Flores atau Komodo? Cerita dong, mau explore apa 😊"
- Good example (English): "Hey! Planning a trip to Flores or Komodo? Tell me a bit about what you have in mind 😊"
- Bad example: immediately listing products with numbers — too pushy, feels like a bot.
- Only introduce specific products AFTER understanding what the guest is looking for.

PRODUCTS (know all details):

1. WAEREBO CULTURAL JOURNEY (2D1N)
   - Price: IDR 1,850,000/pax (direct)
   - Includes: Local expert guide, homestay in Mbaru Niang (traditional cone house), all meals, 4-hour trek roundtrip, welcome ceremony with villagers
   - Highlight: A living, 100% authentic ancestral village at 1,200m altitude. One of Indonesia's most profound travel experiences.
   - Trek: 4 hours up from Desa Denge. Medium difficulty. Suitable for ages 15–65 in good health.
   - Best season: April–October (dry). Nov–Mar possible but wetter.
   - Open trip (min 1 pax), private available. Usually 2x/week (Tue & Sat). Confirm availability first.
   - GetYourGuide: 4.5★ from 93 verified reviews.

2. PHINISI LIVEABOARD 3D2N (Kapal Kanha fleet)
   - KANHA NATHA: Share IDR 3,750,000 | Private OV IDR 6,000,000
   - KANHA LOKA: Share IDR 3,750,000 | Superior IDR 5,000,000 | Family IDR 5,000,000 | Deluxe OV IDR 6,500,000 | Master OV IDR 7,000,000
   - KANHA CITTA: Share IDR 4,000,000 | Deluxe MD IDR 6,500,000 | Upper Deck IDR 7,000,000 | Master OV IDR 7,500,000
   - Includes: All meals, park fees, snorkel gear, guide, transfer
   - Route: Padar Island, Pink Beach, Komodo dragons, Manta Point, Taka Makassar

3. SPEEDBOAT DAY TOUR
   - Price: IDR 1,500,000/pax (direct)
   - Includes: 6 destinations, lunch, guide, snorkel gear, park fees
   - Duration: Full day (07:00–17:00)

BOOKING PROCESS:
1. Guest confirms: date, number of pax, trip choice
2. We send invoice
3. 30% deposit via bank transfer — BCA: 753-506-5233 a.n. PT Salam Dari Timur
4. Full payment 7 days before trip
5. Send transfer receipt via WA

CONTACT:
- WA: +62811342473
- IG: @eastxperience
- Web: eastxperience.github.io/timurproject/eastxperience-direct-booking.html

IMPORTANT RULES:
- NEVER ask for credit card numbers or passwords.
- NEVER make guarantees you can't keep (e.g., "you'll definitely see manta rays").
- If unsure: "Let me confirm with the team and get back to you in 5 minutes."
- Complaints: listen, empathize, escalate to Herdi (owner).
- MICE / groups >10 pax: ask for their number so Herdi can call them directly.
- Keep responses short: max 3 short paragraphs or 1 brief list. WhatsApp is not email.
- Always end with an open question or a clear next step.

INTENT DETECTION:
- "waerebo" / "wae rebo" / "village" / "desa" → focus on Waerebo
- "phinisi" / "liveaboard" / "boat" / "kapal" → focus on Phinisi
- "speedboat" / "day trip" / "1 day" / "satu hari" → focus on Speedboat
- "price" / "harga" / "how much" / "berapa" → give price immediately
- "book" / "booking" / "pesan" / "mau bayar" → guide through booking process
- "full" / "sold out" / "slot" → check availability, offer alternative dates`;

// All messages go through Claude for natural, contextual, bilingual responses.

// ── SEND WA MESSAGE VIA FONNTE ───────────────────────────
async function sendWhatsApp(to, message) {
  try {
    await axios.post('https://api.fonnte.com/send', {
      target: to,
      message: message,
      countryCode: '62'
    }, {
      headers: { 'Authorization': FONNTE_TOKEN }
    });
    console.log(`✅ Sent to ${to}`);
  } catch (err) {
    console.error(`❌ Send failed to ${to}:`, err.message);
  }
}

// ── GENERATE CLAUDE RESPONSE ─────────────────────────────
async function generateReply(phone, userMessage) {
  if (!conversations.has(phone)) {
    conversations.set(phone, { messages: [], lastActive: Date.now() });
  }

  const conv = conversations.get(phone);
  conv.messages.push({ role: 'user', content: userMessage });
  conv.lastActive = Date.now();

  if (conv.messages.length > 20) {
    conv.messages = conv.messages.slice(-20);
  }

  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: conv.messages
    });

    const reply = response.content[0].text;
    conv.messages.push({ role: 'assistant', content: reply });
    return reply;
  } catch (err) {
    console.error('Claude error:', err.message);
    return 'Maaf, ada gangguan sebentar. Coba lagi dalam 1 menit ya, atau hubungi +62811342473 langsung 🙏';
  }
}

app.get('/webhook', (req, res) => {
  res.json({ status: 'ok', service: 'EastXperience WA Bot' });
});

app.post('/webhook', async (req, res) => {
  const data = req.body;
  console.log(`📩 Webhook hit. Body keys: ${Object.keys(data).join(', ')}`);
  console.log(`📩 Raw body: ${JSON.stringify(data).substring(0, 300)}`);

  const phone = data.sender || data.phone || data.from;
  const message = data.message || data.text || data.body || '';
  const name = data.name || data.pushname || 'Tamu';

  if (!phone || !message) {
    return res.json({ status: 'ignored' });
  }

  if (phone === WA_NUMBER || phone === `62${WA_NUMBER}`) {
    return res.json({ status: 'self_ignored' });
  }
  
// Ignore group chat messages — only respond to direct messages
if (data.isgroup === true || String(phone).includes('@g.us')) {
  console.log(`👥 Group message ignored from ${phone}`);
  return res.json({ status: 'group_ignored' });
}
  console.log(`📥 [${phone}] ${name}: ${message}`);
  res.json({ status: 'processing' });

  const reply = await generateReply(phone, message);
  await sendWhatsApp(phone, reply);
});

app.get('/', (req, res) => {
  res.json({
    status: '✅ EastXperience WA Bot online',
    number: `+${WA_NUMBER}`,
    conversations: conversations.size
  });
});

app.post('/broadcast', async (req, res) => {
  const { targets, message, secret } = req.body;
  if (secret !== process.env.BROADCAST_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  if (!Array.isArray(targets) || !message) {
    return res.status(400).json({ error: 'targets array + message required' });
  }
  res.json({ status: 'broadcasting', count: targets.length });
  for (const phone of targets) {
    await sendWhatsApp(phone, message);
    await new Promise(r => setTimeout(r, 2000));
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 EastXperience WA Bot running on port ${PORT}`);
  console.log(`📱 WA Number: +${WA_NUMBER}`);
});
