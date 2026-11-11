/* Shimmernaya — shared code for the booking page and the admin page.
   TEMPORARY: no backend. Placeholder calendar, bookings saved in this browser, Telegram test bot for messages. */
const BIZ={name:"Shimmernaya",wa:"0812 3456 7890",city:"Indonesia",bank:"BCA 8270 1234 56 a.n. Shimmernaya"};

const SERVICES=[
 {id:"bridal",ico:"👰",n:{id:"Pengantin",en:"Bridal"},d:{id:"Akad, resepsi, atau keduanya",en:"Ceremony, reception or both"},extra:350000,pk:[
   {id:"akad",n:{id:"Akad / Pemberkatan",en:"Ceremony"},d:{id:"Makeup + hairdo/hijab do",en:"Makeup + hair or hijab styling"},p:2500000,m:150},
   {id:"resepsi",n:{id:"Resepsi",en:"Reception"},d:{id:"Full glam + hairdo/hijab do",en:"Full glam + hair or hijab styling"},p:3000000,m:180},
   {id:"both",n:{id:"Akad + Resepsi",en:"Ceremony + Reception"},d:{id:"2 look, touch-up di antara acara",en:"2 looks, touch-up in between"},p:5000000,m:300}]},
 {id:"wisuda",ico:"🎓",n:{id:"Wisuda",en:"Graduation"},d:{id:"Natural flawless, tahan seharian",en:"Natural, lasts all day"},extra:300000,pk:[
   {id:"basic",n:{id:"Makeup saja",en:"Makeup only"},d:{id:"Natural / soft glam",en:"Natural / soft glam"},p:450000,m:60},
   {id:"plus",n:{id:"Makeup + hijab do / hairdo",en:"Makeup + hijab or hair styling"},d:{id:"Paling sering dipilih",en:"Most popular"},p:600000,m:90}]},
 {id:"party",ico:"✨",n:{id:"Pesta / Kondangan",en:"Party / Wedding guest"},d:{id:"Tamu undangan, ulang tahun, gala",en:"Guest, birthday, gala"},extra:300000,pk:[
   {id:"soft",n:{id:"Soft glam",en:"Soft glam"},d:{id:"Makeup saja",en:"Makeup only"},p:400000,m:60},
   {id:"glam",n:{id:"Full glam + hairdo/hijab do",en:"Full glam + hair or hijab"},d:{id:"Bulu mata & styling termasuk",en:"Lashes & styling included"},p:600000,m:90}]},
 {id:"lamaran",ico:"💍",n:{id:"Lamaran / Tunangan",en:"Engagement"},d:{id:"Look elegan untuk acara keluarga",en:"Elegant look for the family event"},extra:350000,pk:[
   {id:"std",n:{id:"Paket Lamaran",en:"Engagement package"},d:{id:"Makeup + hairdo/hijab do",en:"Makeup + hair or hijab styling"},p:1200000,m:120}]},
 {id:"photo",ico:"📸",n:{id:"Photoshoot",en:"Photoshoot"},d:{id:"Prewedding, produk, personal",en:"Pre-wedding, product, personal"},extra:350000,pk:[
   {id:"one",n:{id:"1 look",en:"1 look"},d:{id:"Tetap di lokasi 2 jam",en:"Stays on set 2 hrs"},p:500000,m:120},
   {id:"two",n:{id:"2 look",en:"2 looks"},d:{id:"Ganti look di tengah sesi",en:"Look change mid-shoot"},p:850000,m:180}]}
];
const TRANSPORT={in:100000,out:250000};
const READY_SLOTS=[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
const EARLIEST=4*60, DAY_END=21*60, BUFFER=60, EXTRA_MIN=45;

/* ---------- helpers ---------- */
let LANG="id";
try{LANG=localStorage.getItem("shimmer_lang")||"id"}catch(e){}
const rp=x=>"Rp"+Math.round(x||0).toLocaleString("id-ID");
const hm=m=>String(Math.floor(m/60)).padStart(2,"0")+"."+String(m%60).padStart(2,"0");
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const fromIso=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const TODAY=(()=>{const d=new Date();d.setHours(0,0,0,0);return d})();
const locale=()=>LANG==="id"?"id-ID":"en-GB";
const fmtDate=d=>(typeof d==="string"?fromIso(d):d).toLocaleDateString(locale(),{weekday:"long",day:"numeric",month:"long",year:"numeric"});
const fmtShort=d=>(typeof d==="string"?fromIso(d):d).toLocaleDateString(locale(),{weekday:"short",day:"numeric",month:"short"});
const durTxt=m=>{const h=Math.floor(m/60),r=m%60;if(LANG==="id")return h?(r?`${h} jam ${r} menit`:`${h} jam`):`${r} menit`;return h?(r?`${h} hr ${r} min`:`${h} hr`):`${r} min`};
const waIntl=w=>{let d=String(w||"").replace(/\D/g,"");if(d.startsWith("0"))d="62"+d.slice(1);return d};
function rnd(seed){let x=seed%2147483647||1;return()=>(x=x*16807%2147483647)/2147483647}
const svcById=id=>SERVICES.find(s=>s.id===id);

/* ---------- TEMPORARY local backend (no Supabase) ----------
   Calendar = placeholder busy times. Bookings are saved in this browser only.
   Messages go straight to the TEST Telegram bot (@shimmernaya_test_bot).
   The bot token is visible in this file: it's a throwaway test bot — revoke it in @BotFather before going live. */
const TG_TOKEN="8966584771:AAF95KIZ2XS3jeCkZXbeHpRM1UiEjzMfWFc", TG_BOT="shimmernaya_test_bot", TG_ADMIN_START="admin_k7Q2mZ9x";
const ADMIN_PIN="2580", SITE_ADMIN=location.href.replace(/[^/]*([?#].*)?$/,"")+"admin.html#inv-";
const MKEY="shimmer_mock_v1";
const mload=()=>{try{return JSON.parse(localStorage.getItem(MKEY))||{bookings:[],seq:1001}}catch(e){return{bookings:[],seq:1001}}};
const msave=db=>{try{localStorage.setItem(MKEY,JSON.stringify(db))}catch(e){}};
class ApiErr extends Error{constructor(status,msg){super(msg);this.status=status}}

/* placeholder "her calendar": a few fixed busy blocks per day */
function placeholderBusy(ds){
  const d=fromIso(ds), r=rnd(d.getFullYear()*400+d.getMonth()*32+d.getDate()+7), wk=d.getDay()===0||d.getDay()===6, out=[];
  if(r()<(wk?.18:.06)) return [{start:0,end:1440,title:"Contoh: penuh seharian",allDay:true}];
  const c=r()<.4?0:(r()<.6?1:2);
  for(let i=0;i<c;i++){const s=(6+Math.floor(r()*9))*60;out.push({start:s,end:s+(2+Math.floor(r()*3))*60,title:"Contoh jadwal",allDay:false})}
  return out;
}
const busyOn=(ds,db,skipId)=>[...placeholderBusy(ds),...db.bookings.filter(b=>b.date===ds&&b.id!==skipId).map(b=>({start:b.start_min,end:b.end_min}))];
const clash=(list,s,e,buf)=>list.some(x=>s<x.end+buf&&e>x.start-buf);
const fmtID=ds=>fromIso(ds).toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

/* ---------- Telegram, straight from the browser ---------- */
let tgReady=null;
async function tg(method,body){
  const r=await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body||{})});
  return r.json();
}
// the old webhook pointed at the paused backend; it must go for getUpdates to work
function tgInit(){return tgReady||(tgReady=tg("deleteWebhook",{drop_pending_updates:false}).catch(()=>{}))}
async function tgStarts(param){ // chat ids that sent "/start <param>" (Telegram keeps these ~24h)
  await tgInit();
  const j=await tg("getUpdates",{allowed_updates:["message"],timeout:0});
  if(!j.ok) return [];
  return [...new Set((j.result||[]).map(u=>u.message).filter(m=>m&&String(m.text||"").trim()===`/start ${param}`).map(m=>m.chat.id))];
}
async function adminChats(){
  let cached=[];try{cached=JSON.parse(localStorage.getItem("shimmer_tg_admins"))||[]}catch(e){}
  const found=await tgStarts(TG_ADMIN_START).catch(()=>[]);
  const fresh=found.filter(c=>!cached.includes(c));
  for(const c of fresh) await tg("sendMessage",{chat_id:c,text:"✅ Akun ini sekarang menerima notifikasi booking baru Shimmernaya (tes)."});
  const all=[...new Set([...cached,...found])];
  try{localStorage.setItem("shimmer_tg_admins",JSON.stringify(all))}catch(e){}
  return all;
}
async function tgNotifyAdmin(b){
  const label=`${b.label_id}${b.people>1?` (${b.people} orang)`:""}`;
  const text=`🔔 Booking baru, DP sudah masuk\n\n👤 ${b.name} (${b.wa})\n💄 ${label}\n📅 ${fmtID(b.date)}\n⏰ Klien siap jam ${hm(b.ready_min)}, saran mulai makeup ${hm(b.start_min)}\n📍 ${b.loc}\n💰 DP ${rp(b.dp)}${b.note?`\n📝 ${b.note}`:""}\n\nKode: ${b.code}`;
  const chats=await adminChats();
  if(!chats.length) return "failed: admin belum tekan Start di bot";
  let res="sent";
  for(const c of chats){const r=await tg("sendMessage",{chat_id:c,text,reply_markup:{inline_keyboard:[[{text:"📄 Cek & kirim invoice",url:SITE_ADMIN+b.code}]]}});if(!r.ok)res="failed: "+(r.description||"telegram")}
  return res;
}
function clientConfirmText(b){
  const label=`${b.label_id}${b.people>1?` (${b.people} orang)`:""}`;
  return `Halo Kak ${b.name}! 💕\nDP ${rp(b.dp)} untuk booking ${b.code} sudah kami terima ✅\n\n💄 ${label}\n📅 ${fmtID(b.date)}\n⏰ Kakak siap jam ${hm(b.ready_min)}\n📍 ${b.loc}\n\nJadwal Kakak sudah dikunci. Invoice resmi menyusul dari kami setelah dicek, dan H-1 kami kabari jam mulai makeup. Sampai ketemu! 🤍\n— Shimmernaya`;
}
// called by the booking page while it waits for the client to press Start
async function tgCheckClient(code){
  const db=mload(), b=db.bookings.find(x=>x.code===code); if(!b) return null;
  if(b.tg_client==="sent") return "sent";
  const chats=await tgStarts(code).catch(()=>[]);
  if(!chats.length) return null;
  const r=await tg("sendMessage",{chat_id:chats[0],text:clientConfirmText(b)});
  const db2=mload(), bb=db2.bookings.find(x=>x.code===code);
  bb.tg_chat=chats[0]; bb.tg_client=r.ok?"sent":"failed: "+(r.description||""); msave(db2);
  return bb.tg_client;
}

/* ---------- same actions the real backend had ---------- */
async function api(a,{method="GET",body=null,params={},pin=null}={}){
  const db=mload();
  if(a==="availability"){
    const days={};
    for(let d=fromIso(params.from);d<=fromIso(params.to);d.setDate(d.getDate()+1)){const ds=iso(d);days[ds]=busyOn(ds,db).map(x=>[x.start,x.end])}
    return {days};
  }
  if(a==="book"){
    const s=svcById(body.svc), k=s?.pk.find(p=>p.id===body.pkg); if(!s||!k) throw new ApiErr(400,"unknown service");
    const people=Math.max(1,Math.min(6,+body.people||1)), ready=+body.ready*60, len=k.m+EXTRA_MIN*(people-1), start=ready-len;
    if(clash(busyOn(body.date,db),start,ready,BUFFER)) throw new ApiErr(409,"slot taken");
    const area=body.loc==="home"?(body.area==="out"?"out":"in"):null;
    const items=[{d:`${s.n.id} – ${k.n.id}`,q:1,p:k.p}];
    if(people>1) items.push({d:"Orang tambahan",q:people-1,p:s.extra});
    if(area) items.push({d:"Transport "+(area==="in"?"dalam kota":"luar kota"),q:1,p:TRANSPORT[area]});
    const total=items.reduce((x,i)=>x+i.q*i.p,0), dp=Math.ceil(total/2/1000)*1000;
    const b={id:"b"+Date.now(),code:"SHM-"+(db.seq++),src:"online",date:body.date,start_min:start,end_min:ready,ready_min:ready,
      name:String(body.name||"").trim(),wa:String(body.wa||"").trim(),svc:body.svc,label_id:`${s.n.id} – ${k.n.id}`,label_en:`${s.n.en} – ${k.n.en}`,
      people,loc:area?`${String(body.addr||"").trim()} (${area==="in"?"dalam kota":"luar kota"})`:"Studio Shimmernaya",note:String(body.note||"").trim(),
      items,discount:0,dp,pay_method:body.pay||"",inv:"review",inv_note:""};
    db.bookings.push(b); msave(db);
    let alert; try{alert=await tgNotifyAdmin(b)}catch(e){alert="failed: tidak bisa menghubungi Telegram"}
    const db2=mload(); db2.bookings.find(x=>x.id===b.id).tg_alert=alert; msave(db2);
    return {...b,tg_alert:alert,tg_link:`https://t.me/${TG_BOT}?start=${b.code}`,calendar:false};
  }
  if(pin!==ADMIN_PIN) throw new ApiErr(401,"wrong PIN");
  adminChats().catch(()=>{}); // links any admin who pressed Start
  if(a==="pin") return {ok:true};
  if(a==="list"){
    const external=[];
    for(let d=fromIso(params.from);d<=fromIso(params.to);d.setDate(d.getDate()+1)){const ds=iso(d);placeholderBusy(ds).forEach((x,i)=>external.push({id:"p:"+ds+":"+i,date:ds,start:x.start,end:x.end,title:x.title,allDay:x.allDay}))}
    return {bookings:db.bookings.filter(b=>b.date>=params.from&&b.date<=params.to),external};
  }
  if(a==="save"){
    const isBlock=body.src==="block";
    if(clash(busyOn(body.date,db,body.id),+body.start_min,+body.end_min,0)) throw new ApiErr(409,"clash");
    let b=body.id?db.bookings.find(x=>x.id===body.id):null;
    if(!b){b={id:"m"+Date.now(),code:"SHM-"+(db.seq++),src:isBlock?"block":"manual",inv:"review",items:[],discount:0,dp:0,inv_note:""};db.bookings.push(b)}
    Object.assign(b,{date:body.date,start_min:+body.start_min,end_min:+body.end_min,ready_min:isBlock?null:+body.end_min});
    if(isBlock) Object.assign(b,{reason:body.reason||"",name:"",people:0});
    else Object.assign(b,{name:body.name,wa:body.wa,svc:body.svc,label_id:body.label,label_en:body.label,people:body.people,loc:body.loc,note:body.note,dp:+body.dp||0,...(body.items?{items:body.items}:{})});
    msave(db); return b;
  }
  if(a==="delete"){db.bookings=db.bookings.filter(x=>x.id!==body.id);msave(db);return {ok:true}}
  if(a==="invoice"){
    const b=db.bookings.find(x=>x.id===body.id); if(!b) throw new ApiErr(404,"not found");
    if(body.items) b.items=body.items; if(body.discount!=null) b.discount=+body.discount||0; if(body.dp!=null) b.dp=+body.dp||0;
    if(body.inv_note!=null) b.inv_note=body.inv_note; if(body.inv) b.inv=body.inv; msave(db); return b;
  }
  if(a==="send_invoice"){
    const b=db.bookings.find(x=>x.id===body.id); if(!b) throw new ApiErr(404,"not found");
    let chat=b.tg_chat; if(!chat){const c=await tgStarts(b.code).catch(()=>[]);chat=c[0]}
    if(!chat) throw new ApiErr(409,"no_tg");
    const bytes=Uint8Array.from(atob(body.pdf),c=>c.charCodeAt(0)), fd=new FormData();
    fd.append("chat_id",String(chat));
    fd.append("caption",`Halo Kak ${b.name}, ini invoice resmi untuk booking ${b.code} (${fmtID(b.date)}). Terima kasih sudah memilih Shimmernaya 🤍`);
    fd.append("document",new Blob([bytes],{type:"application/pdf"}),body.filename||`Invoice-${b.code}.pdf`);
    const r=await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendDocument`,{method:"POST",body:fd}).then(x=>x.json());
    if(!r.ok) throw new ApiErr(502,"telegram: "+(r.description||"send failed"));
    const db2=mload(), bb=db2.bookings.find(x=>x.id===b.id); bb.tg_chat=chat; bb.inv="sent"; msave(db2); return bb;
  }
  throw new ApiErr(404,"unknown action");
}
function invNo(b){return "INV-"+b.date.slice(0,4)+"-"+b.code.slice(4)}
/* kept so older calls still work; real data now lives in the backend */
function load(){return {bookings:[]}}
function save(){}

/* ---------- availability (from her Google Calendar + bookings) ---------- */
const BUSY={}, MONTHS=new Map(); // month key -> "ok" | Promise | "err"
const mkey=d=>d.getFullYear()+"-"+pad(d.getMonth()+1);
function monthState(base){return MONTHS.get(mkey(base))}
function loadMonth(base){
  const k=mkey(base); const st=MONTHS.get(k); if(st==="ok"||st instanceof Promise) return st instanceof Promise?st:Promise.resolve();
  const from=iso(new Date(base.getFullYear(),base.getMonth(),1)), to=iso(new Date(base.getFullYear(),base.getMonth()+1,0));
  const pr=api("availability",{params:{from,to}}).then(j=>{
    for(let d=new Date(base.getFullYear(),base.getMonth(),1);d.getMonth()===base.getMonth();d.setDate(d.getDate()+1)) BUSY[iso(d)]=[];
    Object.entries(j.days||{}).forEach(([ds,list])=>BUSY[ds]=list.map(([s,e])=>({start:s,end:e})));
    MONTHS.set(k,"ok");
  }).catch(e=>{MONTHS.set(k,"err");throw e});
  MONTHS.set(k,pr); return pr;
}
function resetAvailability(){MONTHS.clear();for(const k in BUSY) delete BUSY[k]}
function entriesFor(dateStr){return (BUSY[dateStr]||[]).slice().sort((a,b)=>a.start-b.start)}

function readyFree(dateStr,readyH,len){
  const e=readyH*60,s=e-len; if(s<EARLIEST||e>DAY_END) return false;
  return !entriesFor(dateStr).some(x=>s<x.end+BUFFER && e>x.start-BUFFER);
}
function dayStatus(dateStr,_db,len=90){
  if(fromIso(dateStr)<=TODAY) return "past";
  const free=READY_SLOTS.filter(h=>readyFree(dateStr,h,len)).length;
  return free===0?"full":free<=5?"limited":"open";
}
function dayOpenFor(dateStr,len){return fromIso(dateStr)>TODAY && READY_SLOTS.some(h=>readyFree(dateStr,h,len))}

/* ---------- shared UI bits ---------- */
function langToggle(onChange){
  const el=document.createElement("div");
  el.innerHTML=`<div class="lang" role="group" aria-label="Language"><button data-l="id">ID</button><button data-l="en">EN</button></div><div class="demo-tag"></div>`;
  const paint=()=>{el.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.l===LANG));el.querySelector(".demo-tag").textContent=LANG==="id"?"tombol bahasa (demo)":"language toggle (demo)";};
  el.querySelectorAll("button").forEach(b=>b.onclick=()=>{LANG=b.dataset.l;try{localStorage.setItem("shimmer_lang",LANG)}catch(e){}paint();document.documentElement.lang=LANG;onChange()});
  paint();document.documentElement.lang=LANG;return el;
}
function monthGrid(base,cellFn){
  const first=(base.getDay()+6)%7, days=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
  const dows=LANG==="id"?["Sen","Sel","Rab","Kam","Jum","Sab","Min"]:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  let h=dows.map(x=>`<span class="dow">${x}</span>`).join("");
  for(let i=0;i<first;i++) h+="<span></span>";
  for(let d=1;d<=days;d++) h+=cellFn(iso(new Date(base.getFullYear(),base.getMonth(),d)),d);
  return `<div class="grid7">${h}</div>`;
}
const monthName=base=>base.toLocaleDateString(locale(),{month:"long",year:"numeric"});

/* ---------- swipe between months (finger on phone, drag with mouse on computer) ---------- */
let SWIPE_DIR=0, SUPPRESS_CLICK_UNTIL=0;
document.addEventListener("click",e=>{if(Date.now()<SUPPRESS_CLICK_UNTIL){e.stopPropagation();e.preventDefault()}},true);
function attachSwipe(cal){
  if(!cal) return;
  const prev=cal.querySelector("#pm"), next=cal.querySelector("#nm");
  // arrows also animate
  cal.addEventListener("click",e=>{if(e.target.closest("#nm"))SWIPE_DIR=1;else if(e.target.closest("#pm"))SWIPE_DIR=-1},true);
  let x0=null,y0=0,id=null;
  cal.addEventListener("pointerdown",e=>{if(e.button>0)return;x0=e.clientX;y0=e.clientY;id=e.pointerId});
  cal.addEventListener("pointerup",e=>{
    if(x0==null||e.pointerId!==id) return;
    const dx=e.clientX-x0, dy=e.clientY-y0; x0=null;
    if(Math.abs(dx)<45||Math.abs(dx)<Math.abs(dy)*1.3) return;
    const btn=dx<0?next:prev;
    SUPPRESS_CLICK_UNTIL=Date.now()+350;
    if(btn&&!btn.disabled){SWIPE_DIR=dx<0?1:-1;btn.onclick()}
    else{const g=cal.querySelector(".grid7");if(g){g.classList.remove("bump");void g.offsetWidth;g.classList.add("bump")}}
  });
  cal.addEventListener("pointercancel",()=>{x0=null});
  if(SWIPE_DIR){const g=cal.querySelector(".grid7");if(g)g.classList.add(SWIPE_DIR>0?"in-r":"in-l");SWIPE_DIR=0}
}
