/* Shimmernaya — shared data for the booking page and the admin page.
   TEMPORARY: everything is stored in this browser (localStorage). No backend yet,
   so the admin page and booking page only sync on the same phone + browser. */
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

/* ---------- store ---------- */
const KEY="shimmer_v1";
function load(){try{return JSON.parse(localStorage.getItem(KEY))||{bookings:[],seq:1}}catch(e){return{bookings:[],seq:1}}}
function save(db){try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}}
function newCode(db){const n=db.seq++;return "SHM-"+String(1000+n)}
function invNo(b){return "INV-"+b.date.slice(0,4)+"-"+b.code.slice(4)}

/* ---------- example bookings (stand-in for her real calendar) ---------- */
const FAKE_NAMES=["Siti Rahma","Dewi Anggraini","Putri Ayu","Nadia Salsabila","Rina Marlina","Intan Permata","Fitri Handayani","Maya Sari","Ayu Lestari","Bunga Citra","Tiara Andini","Laras Wulandari"];
const exCache={};
function examplesFor(dateStr){
  if(exCache[dateStr]) return exCache[dateStr];
  const d=fromIso(dateStr), r=rnd(d.getFullYear()*400+d.getMonth()*32+d.getDate()+7), out=[];
  const wk=d.getDay()===0||d.getDay()===6;
  if(r()<(wk?.22:.08)){
    out.push({id:"ex-"+dateStr,src:"example",date:dateStr,start:5*60,end:20*60,ready:null,name:FAKE_NAMES[Math.floor(r()*FAKE_NAMES.length)],svc:"bridal",label:{id:"Pengantin – Akad + Resepsi",en:"Bridal – Ceremony + Reception"},people:3});
  }else{
    const c=r()<.35?0:(r()<.55?1:2);
    for(let i=0;i<c;i++){const s=(6+Math.floor(r()*9))*60,len=(2+Math.floor(r()*3))*60;const sv=SERVICES[1+Math.floor(r()*4)];
      out.push({id:"ex-"+dateStr+"-"+i,src:"example",date:dateStr,start:s,end:s+len,ready:s+len,name:FAKE_NAMES[Math.floor(r()*FAKE_NAMES.length)],svc:sv.id,label:{id:sv.n.id,en:sv.n.en},people:1+Math.floor(r()*2)});}
  }
  return exCache[dateStr]=out;
}
function entriesFor(dateStr,db){db=db||load();return [...examplesFor(dateStr),...db.bookings.filter(b=>b.date===dateStr)].sort((a,b)=>a.start-b.start)}

/* ---------- availability ---------- */
function readyFree(dateStr,readyH,len,db){
  const e=readyH*60,s=e-len; if(s<EARLIEST||e>DAY_END) return false;
  return !entriesFor(dateStr,db).some(x=>s<x.end+BUFFER && e>x.start-BUFFER);
}
function dayStatus(dateStr,db,len=90){
  if(fromIso(dateStr)<=TODAY) return "past";
  const free=READY_SLOTS.filter(h=>readyFree(dateStr,h,len,db)).length;
  return free===0?"full":free<=5?"limited":"open";
}
function dayOpenFor(dateStr,len,db){return fromIso(dateStr)>TODAY && READY_SLOTS.some(h=>readyFree(dateStr,h,len,db))}

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
