/* =========================================================
   THE STAG HUNT ONLINE v5 — Meadowbank multiplayer server
   Node.js + ws. Up to 12 players.
   - Deterministic 1000-crowd (seed per round, shared sim)
   - Server-driven stag: wanders, flees, taunts, fights back
   - 25 hits, haymakers worth 3, 5-minute escape clock
   - Server decides knockdown outcomes so all clients agree
   ========================================================= */
'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const WebSocket=require('ws');

const PORT=process.env.PORT||3000;
const MAX_PLAYERS=12;
const GRACE=parseInt(process.env.STAG_DELAY_MS||'60000',10);
const STAG_HITS=parseInt(process.env.STAG_HITS||'50',10);
const ROUND_MS=parseInt(process.env.ROUND_MS||'300000',10);
const FLEE=5.6,STAG_WANDER=1.15;

/* ---------- static ---------- */
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=http.createServer((req,res)=>{
  let file=req.url==='/'?'/index.html':req.url.split('?')[0];
  const fp=path.join(__dirname,'public',path.normalize(file).replace(/^(\.\.[\/\\])+/,''));
  fs.readFile(fp,(err,data)=>{
    if(err){res.writeHead(404);res.end('Not found at this fixture.');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});
    res.end(data);
  });
});

/* ==CROWD SIM== deterministic; THIS BLOCK MUST BE BYTE-IDENTICAL IN SERVER AND CLIENT */
var CROWD_N=1000,CROWD_DT=0.05;
var ZONES=[
  {x1:-30,x2:30,z1:-18,z2:18},
  {x1:-35,x2:35,z1:-34,z2:-26},
  {x1:-50,x2:-39.5,z1:-22,z2:22},
  {x1:46.5,x2:50.5,z1:-20,z2:20},
  {x1:-36,x2:-25,z1:26,z2:37},
  {x1:-18,x2:18,z1:39,z2:43},
];
var ZONE_COUNTS=[0,300,240,140,160,160];
function mulberry32(a){return function(){var t=(a+=0x6D2B79F5);t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
var C={
  x:new Float64Array(CROWD_N),z:new Float64Array(CROWD_N),
  tx:new Float64Array(CROWD_N),tz:new Float64Array(CROWD_N),
  sp:new Float64Array(CROWD_N),zone:new Uint8Array(CROWD_N),
};
var role=new Uint8Array(CROWD_N);   /* 0 wander 1 stand 2 fight */
var kit=new Uint8Array(CROWD_N);
var partner=new Int16Array(CROWD_N);
var npcRng=new Array(CROWD_N);
var simStagIndex=-1;                 /* sim skips this index; owner moves it */
function initZonesKit(){
  var i=0;
  for(var zi=0;zi<ZONE_COUNTS.length;zi++){
    for(var k=0;k<ZONE_COUNTS[zi];k++,i++){
      C.zone[i]=zi;
      var r=mulberry32(1000+i*7);
      C.sp[i]=0.5+r()*0.9;
      kit[i]=(zi===2||zi===4||(zi===1&&k<100))?1:0;
    }
  }
}
initZonesKit();
function buildPostMatchChaos(seed){
  var R=mulberry32(seed>>>0);
  for(var i=0;i<CROWD_N;i++)npcRng[i]=mulberry32((seed+i*2654435761)>>>0);
  var P={x1:-29,x2:29,z1:-17,z2:17};
  var reds=[],blues=[];
  for(var i2=0;i2<CROWD_N;i2++){
    role[i2]=0;partner[i2]=-1;
    (kit[i2]?blues:reds).push(i2);
  }
  var pairs=Math.min(320,reds.length,blues.length);
  for(var k2=0;k2<pairs;k2++){
    var a=reds.pop(),b=blues.pop();
    var onLine=R()<0.75;
    var px=onLine?-10+R()*20:P.x1+R()*(P.x2-P.x1);
    var pz=P.z1+R()*(P.z2-P.z1);
    C.x[a]=px+0.5;C.z[a]=pz+(R()-0.5)*0.3;
    C.x[b]=px-0.5;C.z[b]=pz+(R()-0.5)*0.3;
    role[a]=2;role[b]=2;partner[a]=b;partner[b]=a;
  }
  var rest=reds.concat(blues);
  var nStand=Math.min(100,rest.length);
  for(var k3=0;k3<nStand;k3++){
    var i3=rest[k3];
    var px3=kit[i3]?P.x1+R()*26:3+R()*26;
    var pz3=P.z1+R()*(P.z2-P.z1);
    C.x[i3]=px3;C.z[i3]=pz3;
    role[i3]=1;
  }
  for(var k4=nStand;k4<rest.length;k4++){
    var i4=rest[k4];
    if(R()<0.45){
      C.zone[i4]=0;
      C.x[i4]=kit[i4]?P.x1+R()*26:3+R()*26;
      C.z[i4]=P.z1+R()*(P.z2-P.z1);
    }else{
      var zi4=C.zone[i4];
      if(zi4===0)zi4=kit[i4]?(R()<0.5?2:4):(R()<0.5?3:5);
      C.zone[i4]=zi4;
      var Z4=ZONES[zi4];
      C.x[i4]=Z4.x1+R()*(Z4.x2-Z4.x1);
      C.z[i4]=Z4.z1+R()*(Z4.z2-Z4.z1);
      if(zi4===1)C.x[i4]=kit[i4]?-35+R()*32:3+R()*32;
    }
    C.tx[i4]=C.x[i4];C.tz[i4]=C.z[i4];
    role[i4]=0;
  }
}
function crowdStep(){
  for(var i=0;i<CROWD_N;i++){
    if(role[i]!==0)continue;
    if(i===simStagIndex)continue;
    var dx=C.tx[i]-C.x[i],dz=C.tz[i]-C.z[i],d2=dx*dx+dz*dz;
    if(d2<0.09){
      var Z=ZONES[C.zone[i]];
      var rr=npcRng[i]||(npcRng[i]=mulberry32(i+1));
      C.tx[i]=Z.x1+rr()*(Z.x2-Z.x1);
      C.tz[i]=Z.z1+rr()*(Z.z2-Z.z1);
      if(C.zone[i]===1)C.tx[i]=kit[i]?-35+rr()*32:3+rr()*32;
    }else{
      var d=Math.sqrt(d2);
      C.x[i]+=dx/d*C.sp[i]*CROWD_DT;
      C.z[i]+=dz/d*C.sp[i]*CROWD_DT;
    }
  }
}
/* ==END CROWD SIM== */

/* ---------- game state ---------- */
let tick=0,roundTick=0;
let roundSeed=0;
let stagIndex=-1,stagHits=0,stagDue=Infinity,roundEnd=Infinity,stagFleeing=false;
let stagPunchT=0,roundOver=false;
let phase='lobby',hostId=null; /* server waits in the tunnel until the host kicks off */
const players=new Map(); /* id -> {ws,name,phrase,x,z,yaw,down,drag,alive} */
let nextId=1;

function bcast(obj,except){
  const s=JSON.stringify(obj);
  for(const p of players.values())
    if(p.ws.readyState===WebSocket.OPEN&&p.ws!==except)p.ws.send(s);
}
function lobbyState(){
  return {t:'lobby',host:hostId,players:[...players.values()].map(q=>({id:q.id,name:q.name}))};
}
function newRound(){
  for(const q of players.values()){q.dmg=0;q.fans=0;q.kos=0;}
  lastHit.clear();jazzOwner=null;gone.clear();
  roundSeed=(Math.random()*0xffffffff)>>>0;
  buildPostMatchChaos(roundSeed);
  simStagIndex=-1;stagIndex=-1;stagHits=0;stagFleeing=false;
  stagDue=Date.now()+GRACE;roundEnd=Infinity;roundOver=false;
  roundTick=tick;
  bcast({t:'round',seed:roundSeed,due:GRACE,rt:roundTick});
  console.log('new round, seed',roundSeed);
}
function spawnStag(){
  const R=mulberry32((roundSeed^0x5747)>>>0);
  let s=-1,guard=0;
  do{s=(R()*CROWD_N)|0;guard++;}
  while((role[s]!==0||C.zone[s]!==0||Math.abs(C.x[s])>29||Math.abs(C.z[s])>17)&&guard<4000);
  stagIndex=s;simStagIndex=s;stagHits=0;
  roundEnd=Date.now()+ROUND_MS;
  bcast({t:'stag',idx:s,x:C.x[s],z:C.z[s]});
  console.log('stag is npc',s);
}
function board(winnerId){
  return [...players.values()].map(q=>({
    name:q.name,dmg:q.dmg,fans:q.fans,kos:q.kos,
    coins:q.fans+q.kos*5+(q.id===winnerId?1000:0),
  })).sort((a,b)=>b.coins-a.coins||b.dmg-a.dmg);
}
function nearestPlayer(){
  let best=null,bd=1e9;
  for(const p of players.values()){
    if(p.down>0)continue;
    const d=Math.hypot(p.x-C.x[stagIndex],p.z-C.z[stagIndex]);
    if(d<bd){bd=d;best=p;}
  }
  return[best,bd];
}
function updateStag(dt){
  if(stagIndex<0||roundOver)return;
  const i=stagIndex;
  const[np,d]=nearestPlayer();
  const enraged=stagHits>=STAG_HITS-5;
  stagFleeing=false;
  if(np&&enraged){
    stagFleeing=true;
    const dx=np.x-C.x[i],dz=np.z-C.z[i];
    if(d>1.5){C.x[i]+=dx/d*4.8*dt;C.z[i]+=dz/d*4.8*dt;}
    else{
      stagPunchT-=dt;
      if(stagPunchT<=0){
        stagPunchT=0.95;
        bcast({t:'smack',target:np.id,dmg:Math.round(8+Math.random()*5)});
      }
    }
  }else if(np&&d<6.2){
    stagFleeing=true;
    const dx=np.x-C.x[i],dz=np.z-C.z[i];
    const wv=Math.sin(Date.now()/260)*0.9;
    let ex=-dx/d-(dz/d)*wv,ez=-dz/d+(dx/d)*wv;
    const el=Math.hypot(ex,ez)||1;
    C.x[i]+=ex/el*FLEE*dt;C.z[i]+=ez/el*FLEE*dt;
  }else{
    const ddx=C.tx[i]-C.x[i],ddz=C.tz[i]-C.z[i],dd=Math.hypot(ddx,ddz);
    if(dd<0.4){
      const rr=npcRng[i]||(npcRng[i]=mulberry32(i+1));
      C.tx[i]=-28+rr()*56;C.tz[i]=-16+rr()*32;
    }else{C.x[i]+=ddx/dd*C.sp[i]*STAG_WANDER*dt;C.z[i]+=ddz/dd*C.sp[i]*STAG_WANDER*dt;}
  }
  C.x[i]=Math.max(-29,Math.min(29,C.x[i]));
  C.z[i]=Math.max(-17,Math.min(17,C.z[i]));
}
const W_JAB=[1,2,2,3,5],W_HEAVY=[3,4,5,6,5],W_RANGE=[2.5,2.6,3.2,3.0,2.5]; // the Jazz hits for 5
const lastHit=new Map(); /* targetId -> {by,ts} */
let jazzOwner=null; /* one Honda Jazz per round, that's the rule */
const gone=new Set(); /* fans the Jazz has permanently flattened */
function handlePunch(p,heavy,w){
  if(roundOver)return;
  w=Math.max(0,Math.min(4,w|0));
  const jazz=w===4; // the Honda runs fans, ONLY fans
  const fx=-Math.sin(p.yaw),fz=-Math.cos(p.yaw);
  const range=W_RANGE[w]+(heavy?0.2:0);
  if(stagIndex>=0){ // the Jazz may bump him — 1 damage a honk
    const dx=C.x[stagIndex]-p.x,dz=C.z[stagIndex]-p.z,d=Math.hypot(dx,dz);
    if(d<range&&d>0.01&&(jazz||(dx/d)*fx+(dz/d)*fz>0.45)){ // the car hits with its whole body
      const hits=heavy?W_HEAVY[w]:W_JAB[w];
      p.dmg+=hits;
      stagHits=Math.min(STAG_HITS,stagHits+hits);
      bcast({t:'staghit',idx:stagIndex,hits:stagHits,heavy:!!heavy,by:p.id,x:C.x[stagIndex],z:C.z[stagIndex]});
      if(stagHits>=STAG_HITS){
        roundOver=true;
        bcast({t:'win',by:p.id,name:p.name,x:C.x[stagIndex],z:C.z[stagIndex],board:board(p.id)});
        simStagIndex=-1;
      }
      return;
    }
  }
  /* other players next: PvP pays 5x (not from behind a wheel) */
  let bp=null,bpd=range;
  for(const q of players.values()){
    if(q===p||q.down)continue;
    const dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz);
    if(d<bpd&&d>0.01&&(dx/d)*fx+(dz/d)*fz>0.45){bp=q;bpd=d;}
  }
  if(bp){
    const dmg=jazz?5:Math.round((heavy?16:9)+W_JAB[w]*3+Math.random()*4);
    lastHit.set(bp.id,{by:p.id,ts:Date.now()});
    bcast({t:'phit',target:bp.id,by:p.id,dmg,x:+bp.x.toFixed(2),z:+bp.z.toFixed(2)});
    return;
  }
  let bestI=-1,bestD=range;
  for(let i=0;i<CROWD_N;i++){
    if(i===stagIndex||gone.has(i))continue;
    const dx=C.x[i]-p.x,dz=C.z[i]-p.z,d=Math.hypot(dx,dz);
    if(d<bestD&&d>0.01&&(dx/d)*fx+(dz/d)*fz>0.45){bestI=i;bestD=d;}
  }
  if(bestI<0)return;
  const dx=C.x[bestI]-p.x,dz=C.z[bestI]-p.z,dd=Math.hypot(dx,dz)||1;
  let kind='stagger';
  if(jazz)kind='fly';
  else if(heavy)kind='fly';
  else if(w>0||Math.random()<0.4)kind='down';
  if(kind!=='stagger')p.fans++;
  if(jazz)gone.add(bestI);
  bcast({t:'crowdhit',i:bestI,kind,dx:dx/dd,dz:dz/dd,by:p.id,perm:jazz?1:0});
}

/* ---------- ws ---------- */
const wss=new WebSocket.Server({server});
wss.on('connection',ws=>{
  if(players.size>=MAX_PLAYERS){ws.send(JSON.stringify({t:'full'}));ws.close();return;}
  const id=nextId++;
  const p={ws,id,name:'FAN '+id,phrase:'HAVE THAT!',x:25,z:34,yaw:Math.PI*0.75,down:0,drag:0,w:0,dmg:0,fans:0,kos:0};
  players.set(id,p);
  if(hostId===null)hostId=id;
  ws.send(JSON.stringify({
    t:'welcome',id,phase,host:hostId,seed:roundSeed,tick,rt:roundTick,
    stag:stagIndex>=0?{idx:stagIndex,x:C.x[stagIndex],z:C.z[stagIndex],hits:stagHits}:null,
    due:Math.max(0,stagDue-Date.now()),
    players:[...players.values()].filter(q=>q!==p).map(q=>({id:q.id,name:q.name,phrase:q.phrase,x:q.x,z:q.z,yaw:q.yaw,down:q.down,drag:q.drag})),
  }));
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw);}catch(e){return;}
    if(m.t==='join'){
      p.name=String(m.name||'FAN '+id).slice(0,12);
      p.phrase=String(m.phrase||'HAVE THAT!').slice(0,16).toUpperCase();
      bcast({t:'pjoin',id,name:p.name,phrase:p.phrase},ws);
      bcast(lobbyState());
    }else if(m.t==='start'){
      if(phase==='lobby'&&id===hostId){phase='playing';newRound();console.log('host',p.name,'kicked off');}
    }else if(m.t==='state'){
      const nx=+m.x,nz=+m.z;
      if(isFinite(nx)&&isFinite(nz)){
        const dx=nx-p.x,dz=nz-p.z,dist=Math.hypot(dx,dz);
        if(dist<3){p.x=nx;p.z=nz;}            /* ~speed cap per state tick */
        else{p.x+=dx/dist*3;p.z+=dz/dist*3;}
        p.x=Math.max(-52,Math.min(52,p.x));
        p.z=Math.max(-36,Math.min(44,p.z));
      }
      if(isFinite(+m.yaw))p.yaw=+m.yaw;
      const wasDown=p.down;
      p.down=m.down?1:0;p.drag=m.drag?1:0;
      if(Number.isFinite(+m.w))p.w=Math.max(0,Math.min(4,m.w|0));
      if(!wasDown&&p.down){ /* freshly decked: pay whoever hit them last */
        const lh=lastHit.get(p.id);
        if(lh&&Date.now()-lh.ts<3500){
          const att=players.get(lh.by);
          if(att)att.kos++;
          bcast({t:'pko',target:p.id,by:lh.by});
        }
      }
    }else if(m.t==='punch'){
      handlePunch(p,!!m.heavy,m.w);
    }else if(m.t==='next'){
      if(roundOver)newRound();
    }else if(m.t==='jazz'){
      if(jazzOwner===null){jazzOwner=p.id;bcast({t:'jazz',id:p.id,name:p.name});}
      else{try{ws.send(JSON.stringify({t:'jazznope'}));}catch(e){}}
    }
  });
  ws.on('close',()=>{
    players.delete(id);lastHit.delete(id);bcast({t:'pleave',id});
    if(hostId===id)hostId=players.size?players.values().next().value.id:null;
    if(players.size===0){ /* ground empty: back to the tunnel so the next group starts fresh */
      phase='lobby';roundOver=false;stagIndex=-1;simStagIndex=-1;roundEnd=Infinity;stagDue=Infinity;
      console.log('ground empty - back to lobby');
    }else if(phase==='lobby')bcast(lobbyState());
  });
});

/* ---------- loops ---------- */
setInterval(()=>{ /* sim 20Hz */
  crowdStep();tick++;
  updateStag(CROWD_DT);
  const now=Date.now();
  if(phase==='playing'&&stagIndex<0&&!roundOver&&now>=stagDue&&players.size>0)spawnStag();
  if(stagIndex>=0&&!roundOver&&now>roundEnd){
    roundOver=true;
    bcast({t:'escape',board:board(-1)});
    simStagIndex=-1;stagIndex=-1;
  }
},Math.round(CROWD_DT*1000));

setInterval(()=>{ /* snapshots 10Hz */
  if(players.size===0)return;
  bcast({t:'snap',tick,
    stag:stagIndex>=0?{idx:stagIndex,x:+C.x[stagIndex].toFixed(2),z:+C.z[stagIndex].toFixed(2),f:stagFleeing?1:0,hits:stagHits}:null,
    gone:[...gone],
    players:[...players.values()].map(q=>({id:q.id,name:q.name,phrase:q.phrase,x:+q.x.toFixed(2),z:+q.z.toFixed(2),yaw:+q.yaw.toFixed(2),down:q.down,drag:q.drag,w:q.w})),
  });
},100);

server.listen(PORT,()=>console.log('Meadowbank open on :'+PORT+' - waiting in the lobby'));
