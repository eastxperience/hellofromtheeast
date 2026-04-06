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
// Untuk production: ganti dengan Redis atau DB
const conversations = new Map(); // phone → { messages[], stage, lastActive }

// Cleanup conversation setelah 6 jam tidak aktif
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of conversations) {
    if (now - data.lastActive > 6 * 60 * 60 * 1000) {
      conversations.delete(phone);
    }
  }
}, 30 * 60 * 1000);

// ── EASTXPERIENCE SYSTEM PROMPT ─────────────────────────
const SYSTEM_PROMPT = `Kamu adalah agen booking EastXperience — premium experiential travel brand di Labuan Bajo, Komodo National Park. Dioperasikan oleh PT. Salam Dari Timur.

IDENTITAS:
- Nama kamu: Kirana (agen EastXperience)
- Bahasa: Campur Indonesia + English tergantung tamu. Kalau tamu nulis English, balas English. Kalau Indonesia, balas Indonesia. Kalau campur, ikuti.
- Tone: Hangat, professional, tapi tidak kaku. Seperti teman yang ahli di bidangnya.
- Jangan terlalu formal. Jangan pakai "Dengan Hormat" atau "Dear Sir/Madam".

PRODUK UTAMA (hafal semua harga dan detail):

1. WAEREBO CULTURAL JOURNEY (2 Hari 1 Malam)
   - Harga direct: IDR 1.850.000/pax
   - Apa yang include: Guide lokal expert, homestay di Mbaru Niang (rumah adat), semua makan selama trip, trekking 4 jam PP, welcome ceremony dengan warga desa
   - Highlight: Desa adat yang hidup 100% original di ketinggian 1.200m. Salah satu pengalaman paling authentic di Indonesia.
   - Trek: 4 jam naik, mulai dari Desa Denge. Tingkat kesulitan: medium. Aman untuk usia 15-65 tahun dengan kondisi fit.
   - Best season: April–Oktober (dry season). November–Maret bisa, tapi lebih basah.
   - Min pax: 1 (open trip). Private tersedia.
   - Slot biasanya: 2x per minggu (Selasa & Sabtu). Konfirmasi availability dulu.
   - GYG rating: 4.5★ dari 93 verified reviews.

2. PHINISI LIVEABOARD 3D2N (Kapal Kanha)
   - KANHA NATHA: Share IDR 3.750.000 | Private OV IDR 6.000.000
   - KANHA LOKA: Share IDR 3.750.000 | Superior IDR 5.000.000 | Family IDR 5.000.000 | Deluxe OV IDR 6.500.000 | Master OV IDR 7.000.000
   - KANHA CITTA: Share IDR 4.000.000 | Deluxe MD IDR 6.500.000 | Upper Deck IDR 7.000.000 | Master OV IDR 7.500.000
   - Include: Semua makan, park fees, snorkel gear, guide, transfer
   - Route: Padar Island, Pink Beach, Komodo dragons, Manta Point, Taka Makassar

3. SPEEDBOAT DAY TOUR
   - Harga direct: IDR 1.500.000/pax
   - Include: 6 destinasi, makan siang, guide, snorkel gear, park fees
   - Duration: Full day (07.00 – 17.00)

CARA BOOKING:
1. Tamu konfirmasi tanggal, jumlah pax, pilih trip
2. Tim kirim invoice
3. DP 30% via transfer bank BCA: 753-506-5233 a.n. PT Salam Dari Timur
4. Pelunasan H-7 sebelum trip
5. Konfirmasi via WA setelah transfer

CONTACT RESMI:
- WA: +62811342473
- IG: @eastxperience
- Web: eastxperience.github.io/timurproject/eastxperience-direct-booking.html

RULES PENTING:
- JANGAN pernah minta data kartu kredit atau password
- JANGAN buat janji yang tidak bisa ditepati (cth: "pasti ada manta rays")
- Kalau ditanya sesuatu yang kamu tidak tahu pasti: "Saya konfirmasi dulu ke tim dan balas dalam 5 menit ya"
- Kalau ada complaint: dengarkan, empati, eskalasi ke Herdi (owner)
- Kalau ada inquiry MICE / group >10 pax: langsung minta nomor untuk dihubungi oleh Herdi
- Maksimum respons: 3 paragraf pendek atau 1 list singkat. Jangan terlalu panjang di WA.
- Selalu akhiri dengan pertanyaan terbuka atau next step yang jelas.

DETEKSI INTENT:
- "waerebo" / "wae rebo" / "desa flores" → fokus pitch Waerebo
- "phinisi" / "liveaboard" / "kapal" → fokus Phinisi
- "speedboat" / "day trip" / "1 hari" → fokus Speedboat
- "harga" / "price" / "berapa" → langsung kasih harga, jangan tanya-tanya dulu
- "booking" / "mau pesan" / "konfirmasi" → arahkan ke proses booking
- "full" / "sold out" / "slot" → cek ketersediaan, tawarkan tanggal alternatif`;

// ── QUICK REPLY TEMPLATES ────────────────────────────────
const QUICK_REPLIES = {
  greeting: `Halo! 👋 Selamat datang di EastXperience.

Saya Kirana, siap bantu kamu explore Flores & Komodo 🏔️🌊

Kamu tertarik dengan:
1️⃣ Waerebo — Desa adat di atas awan (2D1N)
2️⃣ Phinisi Liveaboard — 3 hari 2 malam di Komodo
3️⃣ Speedboat Day Tour — Komodo full day
4️⃣ Info lainnya

Reply angkanya atau langsung tanya ya! 😊`,

  waerebo_pitch: `🏔️ *Waerebo — The Village Above the Clouds*

Desa adat Flores yang tersembunyi di ketinggian 1.200m. Trek 4 jam melewati hutan hujan tropis, tiba di salah satu tempat paling authentic di Indonesia.

✅ Guide lokal expert (bukan tour guide biasa)
✅ Menginap di Mbaru Niang — rumah adat tradisional
✅ Welcome ceremony dengan warga desa
✅ Semua makan included
✅ 2 Hari 1 Malam

💰 *IDR 1.850.000/pax* — direct price

⭐ 4.5/5 dari 93 verified reviews di GetYourGuide

Kamu berencana trip kapan? Saya cek slot untuk tanggalmu 🗓️`,

  phinisi_pitch: `🚢 *Phinisi Liveaboard Komodo — 3D2N*

Tidur di atas kapal kayu tradisional. Bangun di antara pulau-pulau. Snorkel bersama manta rays. Hiking Padar sebelum sunrise. Ini bukan tour biasa.

Armada KANHA kami:
— KANHA NATHA: mulai IDR 3.750.000/pax
— KANHA LOKA: mulai IDR 3.750.000/pax
— KANHA CITTA: mulai IDR 4.000.000/pax

Semua include makan, park fees, guide, snorkel gear.

Kamu mau share trip atau private charter?`,

  speedboat_pitch: `⚡ *Speedboat Day Tour — Full Day Komodo*

6 destinasi dalam 1 hari: Padar Island, Pink Beach, Komodo dragons, Manta Point, dan lebih.

💰 *IDR 1.500.000/pax*
Include: guide, makan siang, snorkel gear, park fees

Berangkat jam 07.00, balik sekitar 17.00.

Kamu mau trip tanggal berapa? Berapa orang? 😊`,

  booking_confirm: `Siap! Ini langkah booking-nya:

1️⃣ Konfirmasi: tanggal, jumlah pax, jenis trip
2️⃣ Kami kirim invoice
3️⃣ DP 30% ke rekening:
   *BCA: 753-506-5233*
   a.n. PT Salam Dari Timur
4️⃣ Kirim bukti transfer via WA ini
5️⃣ Booking confirmed! ✅

Ada yang mau dikonfirmasi dulu sebelum booking? 😊`
};

// ── DETECT QUICK REPLY TRIGGER ───────────────────────────
function detectQuickReply(message) {
  const msg = message.toLowerCase().trim();

  if (/^(halo|hi|hello|hai|hey|selamat|pagi|siang|malam|ola|assalam|salam)/.test(msg) && msg.length < 30) {
    return QUICK_REPLIES.greeting;
  }
  if (msg === '1' || /waerebo|wae.?rebo|desa.?(adat|flores|awan)/.test(msg)) {
    return QUICK_REPLIES.waerebo_pitch;
  }
  if (msg === '2' || /phinisi|liveaboard|kapal|3d2n|3 hari/.test(msg)) {
    return QUICK_REPLIES.phinisi_pitch;
  }
  if (msg === '3' || /speedboat|day.?tour|1 hari|satu hari/.test(msg)) {
    return QUICK_REPLIES.speedboat_pitch;
  }
  if (/booking|pesan|konfirmasi|dp|down.?payment|bayar/.test(msg)) {
    return QUICK_REPLIES.booking_confirm;
  }

  return null; // Use Claude for complex queries
}

// ── SEND WA MESSAGE VIA FONNTE ───────────────────────────
async function sendWhatsApp(to, message) {
  try {
    await axios.post('https://api.fonnte.com/send', {
      target: to,
      message: message,
      countryCode: '62'
    }, {
      headers: {
        'Authorization': FONNTE_TOKEN
      }
    });
    console.log(`✅ Sent to ${to}`);
  } catch (err) {
    console.error(`❌ Send failed to ${to}:`, err.message);
  }
}

// ── GENERATE CLAUDE RESPONSE ─────────────────────────────
async function generateReply(phone, userMessage) {
  // Get or create conversation
  if (!conversations.has(phone)) {
    conversations.set(phone, { messages: [], lastActive: Date.now() });
  }

  const conv = conversations.get(phone);
  conv.messages.push({ role: 'user', content: userMessage });
  conv.lastActive = Date.now();

  // Keep last 10 messages only (memory management)
  if (conv.messages.length > 20) {
    conv.messages = conv.messages.slice(-20);
  }

  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001', // Fast + affordable for chatbot
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

// ── MAIN WEBHOOK ─────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  // Fonnte sends data in various formats
  const data = req.body;

  const phone = data.sender || data.phone || data.from;
  const message = data.message || data.text || data.body || '';
  const name = data.name || data.pushname || 'Tamu';

  // Ignore if no phone or message
  if (!phone || !message) {
    return res.json({ status: 'ignored' });
  }

  // Ignore messages FROM our own number (avoid loops)
  if (phone === WA_NUMBER || phone === `62${WA_NUMBER}`) {
    return res.json({ status: 'self_ignored' });
  }

  console.log(`📥 [${phone}] ${name}: ${message}`);

  // Respond immediately to Fonnte
  res.json({ status: 'processing' });

  // Check for quick reply first (instant, no API call)
  const quickReply = detectQuickReply(message);

  if (quickReply) {
    await sendWhatsApp(phone, quickReply);
  } else {
    // Use Claude for complex / contextual replies
    const reply = await generateReply(phone, message);
    await sendWhatsApp(phone, reply);
  }
});

// ── HEALTH CHECK ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: '✅ EastXperience WA Bot online',
    number: `+${WA_NUMBER}`,
    conversations: conversations.size
  });
});

// ── BROADCAST ENDPOINT (manual trigger) ──────────────────
app.post('/broadcast', async (req, res) => {
  const { targets, message, secret } = req.body;

  if (secret !== process.env.BROADCAST_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!Array.isArray(targets) || !message) {
    return res.status(400).json({ error: 'targets array + message required' });
  }

  res.json({ status: 'broadcasting', count: targets.length });

  // Send with 2s delay between each (avoid spam detection)
  for (const phone of targets) {
    await sendWhatsApp(phone, message);
    await new Promise(r => setTimeout(r, 2000));
  }
});

app.listen(PORT, () => {
  console.log(`🚀 EastXperience WA Bot running on port ${PORT}`);
  console.log(`📱 WA Number: +${WA_NUMBER}`);
});
