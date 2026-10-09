// Telegram bot (TEST stand-in for WhatsApp).
// /start admin_<code>  -> this chat receives "new booking" alerts
// /start SHM-1234      -> client links their booking; bot sends the booking confirmation
// GET ?setup=<admin PIN> -> registers this function as the bot's webhook
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const WEBHOOK_SECRET = "shm_tg_9fK2pQ7xL4wR";
const ADMIN_START = "admin_k7Q2mZ9x";
const SITE = "https://fixngoltd-rgb.github.io/shimmernaya-makeup/";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

let tok = "";
async function token() { if (tok) return tok; const { data } = await db.rpc("tg_token"); if (!data) throw new Error("Telegram token missing"); return (tok = data as string); }
async function tg(method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${await token()}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return await r.json();
}
const pad = (n: number) => String(n).padStart(2, "0");
const hm = (m: number) => `${pad(Math.floor(m / 60))}.${pad(m % 60)}`;
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const fmtDate = (d: string) => { const x = new Date(d + "T00:00:00Z"); return `${DAYS[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
const rp = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

async function getSetting(key: string) { const { data } = await db.from("settings").select("value").eq("key", key).maybeSingle(); return data?.value ?? null; }
async function setSetting(key: string, value: unknown) { await db.from("settings").upsert({ key, value, updated_at: new Date().toISOString() }); }

Deno.serve(async (req) => {
  const u = new URL(req.url);
  try {
    if (req.method === "GET" && u.searchParams.get("setup")) {
      const { data: ok } = await db.rpc("admin_pin_ok", { p: u.searchParams.get("setup") });
      if (!ok) return json({ error: "wrong PIN" }, 401);
      const me = await tg("getMe", {});
      const wh = await tg("setWebhook", { url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/tg-webhook`, secret_token: WEBHOOK_SECRET, allowed_updates: ["message"], drop_pending_updates: true });
      if (me.ok) await setSetting("tg_bot_username", me.result.username);
      return json({ bot: me.result?.username, webhook: wh, admin_link: me.ok ? `https://t.me/${me.result.username}?start=${ADMIN_START}` : null });
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    if (req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) return json({ error: "forbidden" }, 403);

    const upd = await req.json().catch(() => ({}));
    const m = upd.message;
    if (!m?.text) return json({ ok: true });
    const chat = m.chat.id;
    const [cmd, param] = String(m.text).trim().split(/\s+/, 2);

    if (cmd === "/start" && param === ADMIN_START) {
      const chats: number[] = (await getSetting("tg_admin_chats")) || [];
      if (!chats.includes(chat)) chats.push(chat);
      await setSetting("tg_admin_chats", chats);
      await tg("sendMessage", { chat_id: chat, text: "✅ Akun ini sekarang menerima notifikasi booking baru Shimmernaya (tes)." });
    } else if (cmd === "/start" && param && /^SHM-\d+$/.test(param)) {
      const { data: b } = await db.from("bookings").select("*").eq("code", param).maybeSingle();
      if (!b) { await tg("sendMessage", { chat_id: chat, text: "Maaf, kode booking tidak ditemukan." }); return json({ ok: true }); }
      const label = `${b.label_id}${b.people > 1 ? ` (${b.people} orang)` : ""}`;
      const text = `Halo Kak ${b.name}! 💕\nDP ${rp(b.dp)} untuk booking ${b.code} sudah kami terima ✅\n\n💄 ${label}\n📅 ${fmtDate(b.date)}\n⏰ Kakak siap jam ${hm(b.ready_min)}\n📍 ${b.loc}\n\nJadwal Kakak sudah dikunci. Invoice resmi menyusul dari kami setelah dicek, dan H-1 kami kabari jam mulai makeup. Sampai ketemu! 🤍\n— Shimmernaya`;
      const r = await tg("sendMessage", { chat_id: chat, text });
      await db.from("bookings").update({ tg_chat: chat, tg_client: r.ok ? "sent" : "failed: " + (r.description || "") }).eq("id", b.id);
    } else {
      await tg("sendMessage", { chat_id: chat, text: `Halo! Ini bot tes Shimmernaya 💄\nBooking makeup di: ${SITE}` });
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ ok: true }); // always 200 so Telegram doesn't retry forever
  }
});
