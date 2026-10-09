// Shimmernaya booking API (TEST project).
// Public:  GET  ?a=availability&from=YYYY-MM-DD&to=YYYY-MM-DD
//          POST ?a=book                      (client booking, price + time re-checked here)
// Admin (header x-admin-pin):
//          GET  ?a=list&from=&to=            (bookings + her own Google events)
//          POST ?a=save                      (create/update manual booking or block)
//          POST ?a=delete                    {id}
//          POST ?a=invoice                   {id, items, discount, dp, inv_note, inv?}
//          POST ?a=send_invoice              {id, pdf(base64), filename} -> WhatsApp document to client
//          GET  ?a=pin                       (check PIN)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CALENDAR_ID = "pooltrialwp@gmail.com";
const TZ = "Asia/Jakarta";          // WIB, UTC+7, no daylight saving
const OFFSET = 7 * 60;              // minutes
const EARLIEST = 4 * 60, DAY_END = 21 * 60, BUFFER = 60, EXTRA_MIN = 45;

const SERVICES: Record<string, { n: [string, string]; extra: number; pk: Record<string, { n: [string, string]; p: number; m: number }> }> = {
  bridal: { n: ["Pengantin", "Bridal"], extra: 350000, pk: {
    akad: { n: ["Akad / Pemberkatan", "Ceremony"], p: 2500000, m: 150 },
    resepsi: { n: ["Resepsi", "Reception"], p: 3000000, m: 180 },
    both: { n: ["Akad + Resepsi", "Ceremony + Reception"], p: 5000000, m: 300 } } },
  wisuda: { n: ["Wisuda", "Graduation"], extra: 300000, pk: {
    basic: { n: ["Makeup saja", "Makeup only"], p: 450000, m: 60 },
    plus: { n: ["Makeup + hijab do / hairdo", "Makeup + hijab or hair styling"], p: 600000, m: 90 } } },
  party: { n: ["Pesta / Kondangan", "Party / Wedding guest"], extra: 300000, pk: {
    soft: { n: ["Soft glam", "Soft glam"], p: 400000, m: 60 },
    glam: { n: ["Full glam + hairdo/hijab do", "Full glam + hair or hijab"], p: 600000, m: 90 } } },
  lamaran: { n: ["Lamaran / Tunangan", "Engagement"], extra: 350000, pk: {
    std: { n: ["Paket Lamaran", "Engagement package"], p: 1200000, m: 120 } } },
  photo: { n: ["Photoshoot", "Photoshoot"], extra: 350000, pk: {
    one: { n: ["1 look", "1 look"], p: 500000, m: 120 },
    two: { n: ["2 look", "2 looks"], p: 850000, m: 180 } } },
};
const TRANSPORT: Record<string, number> = { in: 100000, out: 250000 };
const WA_PHONE_ID = "1348722084991999";   // Meta TEST number +1 555-629-1539
const ALERT_TO = "923487962818";          // who gets the "new booking" alert (test)
const ADMIN_URL = "https://fixngoltd-rgb.github.io/shimmernaya-makeup/admin.html#inv-";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-admin-pin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/* ---------- Google auth ---------- */
let tokenCache: { t: string; exp: number } | null = null;
function b64url(data: ArrayBuffer | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function gToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60000) return tokenCache.t;
  const { data, error } = await db.rpc("google_sa");
  if (error || !data) throw new Error("Google key missing");
  const sa = JSON.parse(data as string);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }) });
  const j = await r.json(); if (!r.ok) throw new Error("Google login failed");
  tokenCache = { t: j.access_token, exp: Date.now() + 3500e3 };
  return j.access_token;
}
async function gcal(path: string, init: RequestInit = {}) {
  const t = await gToken();
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}${path}`, { ...init, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (r.status === 204) return null;
  const j = await r.json(); if (!r.ok) throw new Error("Calendar: " + (j.error?.message || r.status));
  return j;
}

/* ---------- time helpers (WIB) ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
const localIso = (date: string, min: number) => `${date}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00+07:00`;
function toLocal(ms: number) { const d = new Date(ms + OFFSET * 60000); return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; }
const addDays = (date: string, n: number) => new Date(Date.parse(date + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const todayWIB = () => toLocal(Date.now()).date;
const hm = (m: number) => `${pad(Math.floor(m / 60))}.${pad(m % 60)}`;
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const fmtDate = (d: string) => { const x = new Date(d + "T00:00:00Z"); return `${DAYS[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
const rp = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
// Indonesian numbers (08.. / 628..) or any international number written with +
function validWa(raw: string) { const d = raw.replace(/\D/g, ""); return /^(0|62)8\d{7,11}$/.test(d) || (raw.trim().startsWith("+") && d.length >= 10 && d.length <= 15); }
function waNum(raw: string) { let d = String(raw || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "62" + d.slice(1); return d; }

/* ---------- WhatsApp (Cloud API) ---------- */
let waTok = "";
async function waToken() { if (waTok) return waTok; const { data } = await db.rpc("wa_token"); if (!data) throw new Error("WhatsApp token missing"); return (waTok = data as string); }
async function waPost(path: string, body: unknown) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${path}`, { method: "POST", headers: { Authorization: `Bearer ${await waToken()}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, id: j.messages?.[0]?.id } : { ok: false, code: j.error?.code, msg: j.error?.error_data?.details || j.error?.message || String(r.status) };
}
const clean = (s: string) => String(s ?? "").replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim() || "-";
// Approved template first; if the template isn't approved yet, plain text (works inside the 24h chat window)
async function waTemplateOrText(to: string, name: string, params: string[], fallback: string, button?: string) {
  const comps: any[] = [{ type: "body", parameters: params.map((t) => ({ type: "text", text: clean(t) })) }];
  if (button) comps.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: button }] });
  const t = await waPost(`${WA_PHONE_ID}/messages`, { messaging_product: "whatsapp", to, type: "template", template: { name, language: { code: "id" }, components: comps } });
  if (t.ok) return "template";
  const x = await waPost(`${WA_PHONE_ID}/messages`, { messaging_product: "whatsapp", to, type: "text", text: { body: fallback, preview_url: true } });
  if (x.ok) return "text";
  console.error("whatsapp failed", name, t.code, t.msg, x.code, x.msg);
  return "failed: " + (x.code === 131047 ? "no chat in last 24h" : x.code === 131030 ? "number not on Meta test list" : x.msg);
}
async function notifyBooking(b: any) {
  const date = fmtDate(b.date), ready = hm(b.ready_min), start = hm(b.start_min), dp = rp(b.dp);
  const label = `${b.label_id}${b.people > 1 ? ` (${b.people} orang)` : ""}`;
  const [client, alert] = await Promise.all([
    waTemplateOrText(waNum(b.wa), "booking_dp_received", [b.name, dp, b.code, date, ready],
      `Halo Kak ${b.name}! 💕\nDP ${dp} untuk booking ${b.code} sudah kami terima ✅\n\n📅 ${date}\n⏰ Kakak siap jam ${ready}\n\nJadwal Kakak sudah dikunci. Invoice resmi menyusul dari kami setelah dicek, dan H-1 kami kabari jam mulai makeup. Sampai ketemu! 🤍\n— Shimmernaya`),
    waTemplateOrText(ALERT_TO, "new_booking_alert", [b.name, b.wa, label, date, ready, start, b.loc, dp],
      `🔔 Booking baru, DP sudah masuk\n\n👤 ${b.name} (${b.wa})\n💄 ${label}\n📅 ${date}\n⏰ Klien siap jam ${ready}, saran mulai makeup ${start}\n📍 ${b.loc}\n💰 DP ${dp}${b.note ? `\n📝 ${b.note}` : ""}\n\nSudah masuk Google Calendar.\nCek & kirim invoice: ${ADMIN_URL}${b.code}`, b.code),
  ]);
  await db.from("bookings").update({ wa_client: client, wa_alert: alert }).eq("id", b.id);
  b.wa_client = client; b.wa_alert = alert;
}
async function sendInvoice(p: any) {
  const { data: b } = await db.from("bookings").select("*").eq("id", p.id).single();
  if (!b) throw new HttpError(404, "not found");
  if (!b.wa) throw new HttpError(400, "no WhatsApp number on this booking");
  const bytes = Uint8Array.from(atob(String(p.pdf || "")), (c) => c.charCodeAt(0));
  if (bytes.length < 500 || bytes.length > 5e6) throw new HttpError(400, "bad pdf");
  const filename = String(p.filename || `Invoice-${b.code}.pdf`).replace(/[^\w.\-]/g, "_");
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp"); fd.append("type", "application/pdf");
  fd.append("file", new Blob([bytes], { type: "application/pdf" }), filename);
  const up = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/media`, { method: "POST", headers: { Authorization: `Bearer ${await waToken()}` }, body: fd });
  const uj = await up.json(); if (!up.ok) throw new HttpError(502, "upload failed: " + (uj.error?.message || up.status));
  const caption = `Halo Kak ${b.name}, ini invoice resmi untuk booking ${b.code} (${fmtDate(b.date)}). Terima kasih sudah memilih Shimmernaya 🤍`;
  const r = await waPost(`${WA_PHONE_ID}/messages`, { messaging_product: "whatsapp", to: waNum(b.wa), type: "document", document: { id: uj.id, filename, caption } });
  if (!r.ok) {
    const why = r.code === 131047 ? "window" : r.code === 131030 ? "not_test_number" : "other";
    await db.from("bookings").update({ wa_invoice: "failed: " + why }).eq("id", b.id);
    throw new HttpError(409, why + ": " + r.msg);
  }
  const { data } = await db.from("bookings").update({ wa_invoice: "sent", inv: "sent", updated_at: new Date().toISOString() }).eq("id", b.id).select().single();
  return data;
}

type Ev = { id: string; date: string; start: number; end: number; title: string; allDay: boolean; ours: string | null };
// Every event in her Google Calendar, split per local day
async function googleEvents(from: string, to: string): Promise<Ev[]> {
  const out: Ev[] = []; let pageToken = "";
  do {
    const q = new URLSearchParams({ timeMin: localIso(from, 0), timeMax: localIso(addDays(to, 1), 0), singleEvents: "true", maxResults: "2500", timeZone: TZ });
    if (pageToken) q.set("pageToken", pageToken);
    const j = await gcal(`/events?${q}`);
    for (const e of j.items || []) {
      if (e.status === "cancelled") continue;
      const ours = e.extendedProperties?.private?.shimmer_code || null;
      const title = e.summary || "(busy)";
      if (e.start?.date) { // all-day: block each whole day
        for (let d = e.start.date; d < e.end.date; d = addDays(d, 1)) out.push({ id: e.id, date: d, start: 0, end: 1440, title, allDay: true, ours });
        continue;
      }
      let s = Date.parse(e.start.dateTime); const end = Date.parse(e.end.dateTime);
      while (s < end) {
        const L = toLocal(s), dayEndMs = Date.parse(addDays(L.date, 1) + "T00:00:00+07:00");
        const segEnd = Math.min(end, dayEndMs), E = segEnd === dayEndMs ? 1440 : toLocal(segEnd).min;
        out.push({ id: e.id, date: L.date, start: L.min, end: E, title, allDay: false, ours });
        s = segEnd;
      }
    }
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}
async function busyMap(from: string, to: string) {
  const [evs, { data: rows }] = await Promise.all([
    googleEvents(from, to),
    db.from("bookings").select("date,start_min,end_min").gte("date", from).lte("date", to),
  ]);
  const days: Record<string, [number, number][]> = {};
  for (const e of evs) (days[e.date] ||= []).push([e.start, e.end]);
  for (const r of rows || []) (days[r.date] ||= []).push([r.start_min, r.end_min]);
  return days;
}
const clashes = (list: [number, number][], s: number, e: number, buf = BUFFER) => list.some(([a, b]) => s < b + buf && e > a - buf);

/* ---------- calendar event for a booking ---------- */
function eventBody(b: any) {
  const isBlock = b.src === "block";
  const summary = isBlock ? `⛔ ${b.reason || "Blok"}` : `💄 ${b.label_id} – ${b.name}${b.people > 1 ? ` (${b.people})` : ""}`;
  const description = isBlock ? "Diblok dari admin Shimmernaya" : [
    `Klien: ${b.name}`, `WhatsApp: ${b.wa}`, b.ready_min != null ? `Klien siap jam ${hm(b.ready_min)}` : "", `Lokasi: ${b.loc}`,
    b.note ? `Catatan: ${b.note}` : "", `Kode: ${b.code}`, b.src === "online" ? "Sumber: booking online" : "Sumber: booking manual",
  ].filter(Boolean).join("\n");
  const allDay = isBlock && b.start_min <= 0 && b.end_min >= 1440;
  return {
    summary, description, location: isBlock ? undefined : b.loc || undefined,
    start: allDay ? { date: b.date } : { dateTime: localIso(b.date, b.start_min), timeZone: TZ },
    end: allDay ? { date: addDays(b.date, 1) } : { dateTime: localIso(b.date, Math.min(b.end_min, 1439)), timeZone: TZ },
    transparency: "opaque",
    extendedProperties: { private: { shimmer_code: b.code } },
  };
}
async function syncEvent(b: any) {
  try {
    if (b.gcal_event_id) await gcal(`/events/${b.gcal_event_id}`, { method: "PUT", body: JSON.stringify(eventBody(b)) });
    else {
      const ev = await gcal(`/events`, { method: "POST", body: JSON.stringify(eventBody(b)) });
      await db.from("bookings").update({ gcal_event_id: ev.id }).eq("id", b.id);
      b.gcal_event_id = ev.id;
    }
    return true;
  } catch (e) { console.error("calendar sync failed", b.code, String(e)); return false; }
}

/* ---------- handlers ---------- */
async function book(p: any) {
  const s = SERVICES[p.svc]; const k = s?.pk[p.pkg];
  if (!s || !k) throw new HttpError(400, "unknown service");
  const people = Math.max(1, Math.min(6, Number(p.people) || 1));
  const ready = Number(p.ready) * 60; const len = k.m + EXTRA_MIN * (people - 1); const start = ready - len;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || p.date <= todayWIB()) throw new HttpError(400, "bad date");
  if (start < EARLIEST || ready > DAY_END) throw new HttpError(400, "bad time");
  const name = String(p.name || "").trim().slice(0, 80), wa = String(p.wa || "").trim().slice(0, 30);
  if (!name || !validWa(wa)) throw new HttpError(400, "bad contact");
  const busy = (await busyMap(p.date, p.date))[p.date] || [];
  if (clashes(busy, start, ready)) throw new HttpError(409, "slot taken");
  const area = p.loc === "home" ? (p.area === "out" ? "out" : "in") : null;
  const items = [{ d: `${s.n[0]} – ${k.n[0]}`, q: 1, p: k.p }];
  if (people > 1) items.push({ d: "Orang tambahan", q: people - 1, p: s.extra });
  if (area) items.push({ d: "Transport " + (area === "in" ? "dalam kota" : "luar kota"), q: 1, p: TRANSPORT[area] });
  const total = items.reduce((a, i) => a + i.q * i.p, 0), dp = Math.ceil(total / 2 / 1000) * 1000;
  const loc = area ? `${String(p.addr || "").trim().slice(0, 300)} (${area === "in" ? "dalam kota" : "luar kota"})` : "Studio Shimmernaya";
  const { data: b, error } = await db.from("bookings").insert({
    src: "online", date: p.date, start_min: start, end_min: ready, ready_min: ready, name, wa, svc: p.svc,
    label_id: `${s.n[0]} – ${k.n[0]}`, label_en: `${s.n[1]} – ${k.n[1]}`, people, loc, note: String(p.note || "").slice(0, 500),
    items, dp, pay_method: String(p.pay || "").slice(0, 30),
  }).select().single();
  if (error) throw error;
  b.calendar = await syncEvent(b);
  try { await notifyBooking(b); } catch (e) { console.error("notify failed", String(e)); }
  return b;
}

async function save(p: any) {
  const isBlock = p.src === "block";
  const row: any = {
    src: isBlock ? "block" : "manual", date: p.date, start_min: Number(p.start_min), end_min: Number(p.end_min),
    ready_min: isBlock ? null : Number(p.end_min), updated_at: new Date().toISOString(),
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !(row.start_min < row.end_min)) throw new HttpError(400, "bad time");
  if (isBlock) Object.assign(row, { reason: String(p.reason || "").slice(0, 120), name: "", people: 0 });
  else Object.assign(row, {
    name: String(p.name || "").trim().slice(0, 80), wa: String(p.wa || "").trim().slice(0, 30), svc: p.svc || "other",
    label_id: String(p.label || "").slice(0, 120), label_en: String(p.label || "").slice(0, 120), people: Math.max(1, Number(p.people) || 1),
    loc: String(p.loc || "").slice(0, 300), note: String(p.note || "").slice(0, 500), dp: Math.max(0, Number(p.dp) || 0),
  });
  if (!isBlock && Array.isArray(p.items)) row.items = p.items;
  // clash check against everything except itself (no travel buffer for her own entries)
  const [evs, { data: rows }] = await Promise.all([googleEvents(row.date, row.date), db.from("bookings").select("id,code,date,start_min,end_min").eq("date", row.date)]);
  const own = p.id ? (rows || []).find((r) => r.id === p.id) : null;
  const others: [number, number][] = [
    ...evs.filter((e) => !own || e.ours !== own.code).filter((e) => !(rows || []).some((r) => r.code === e.ours)).map((e) => [e.start, e.end] as [number, number]),
    ...(rows || []).filter((r) => r.id !== p.id).map((r) => [r.start_min, r.end_min] as [number, number]),
  ];
  if (!p.force && clashes(others, row.start_min, row.end_min, 0)) throw new HttpError(409, "clash");
  const q = p.id ? db.from("bookings").update(row).eq("id", p.id).select().single() : db.from("bookings").insert(row).select().single();
  const { data: b, error } = await q; if (error) throw error;
  b.calendar = await syncEvent(b);
  return b;
}

async function del(p: any) {
  const { data: b } = await db.from("bookings").select("*").eq("id", p.id).single();
  if (!b) throw new HttpError(404, "not found");
  if (b.gcal_event_id) { try { await gcal(`/events/${b.gcal_event_id}`, { method: "DELETE" }); } catch (e) { console.error(String(e)); } }
  await db.from("bookings").delete().eq("id", p.id);
  return { ok: true };
}

async function invoice(p: any) {
  const upd: any = { updated_at: new Date().toISOString() };
  if (Array.isArray(p.items)) upd.items = p.items.map((i: any) => ({ d: String(i.d || "").slice(0, 200), q: Number(i.q) || 0, p: Number(i.p) || 0 }));
  for (const k of ["discount", "dp"]) if (p[k] != null) upd[k] = Math.max(0, Number(p[k]) || 0);
  if (p.inv_note != null) upd.inv_note = String(p.inv_note).slice(0, 1000);
  if (p.inv === "sent" || p.inv === "review") upd.inv = p.inv;
  const { data, error } = await db.from("bookings").update(upd).eq("id", p.id).select().single();
  if (error) throw error; return data;
}

async function list(from: string, to: string) {
  const [{ data: rows, error }, evs] = await Promise.all([
    db.from("bookings").select("*").gte("date", from).lte("date", to).order("date"),
    googleEvents(from, to),
  ]);
  if (error) throw error;
  const codes = new Set((rows || []).map((r) => r.code));
  const external = evs.filter((e) => !e.ours || !codes.has(e.ours)).map((e) => ({ id: "g:" + e.id + ":" + e.date, date: e.date, start: e.start, end: e.end, title: e.title, allDay: e.allDay }));
  return { bookings: rows, external };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const u = new URL(req.url), a = u.searchParams.get("a");
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (a === "availability") {
      const from = u.searchParams.get("from")!, to = u.searchParams.get("to")!;
      if (!from || !to || (Date.parse(to) - Date.parse(from)) > 400 * 864e5) throw new HttpError(400, "bad range");
      return json({ days: await busyMap(from, to), today: todayWIB() });
    }
    if (a === "book") return json(await book(body));
    // admin below
    const pin = req.headers.get("x-admin-pin") || "";
    const { data: ok } = await db.rpc("admin_pin_ok", { p: pin });
    if (!ok) throw new HttpError(401, "wrong PIN");
    if (a === "pin") return json({ ok: true });
    if (a === "list") return json(await list(u.searchParams.get("from")!, u.searchParams.get("to")!));
    if (a === "save") return json(await save(body));
    if (a === "delete") return json(await del(body));
    if (a === "invoice") return json(await invoice(body));
    if (a === "send_invoice") return json(await sendInvoice(body));
    throw new HttpError(404, "unknown action");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    return json({ error: (e as Error).message || String(e) }, status);
  }
});
