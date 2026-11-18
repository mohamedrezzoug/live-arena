import * as THREE from 'three';
import { LEVELS } from './questions.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const touch=params.get('touch')==='1'||navigator.maxTouchPoints>0;
if(touch)document.body.classList.add('touch');
const myName=(()=>{let n=null;try{n=localStorage.getItem('la_name')}catch{}if(!n){n='لاعب'+Math.floor(100+Math.random()*900);try{localStorage.setItem('la_name',n)}catch{}}return n})();
const ROOM=params.get('room')||String(1000+Math.floor(Math.random()*9000));
const MAXP=20, BOTMIN=8, SPEED=4.2;
const N=10,S=2,HALF=N*S/2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rnd=(a,b)=>a+Math.random()*(b-a);
if(params.get('bots')==='0')$('bots').checked=false;

/* ---------- scene ---------- */
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,touch?1.5:2));
document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0a0b1e);
scene.fog=new THREE.Fog(0x0a0b1e,40,120);
const camera=new THREE.PerspectiveCamera(50,1,.1,300);
scene.add(new THREE.HemisphereLight(0xaabbff,0x221133,1.0));
const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(10,25,10);scene.add(sun);
function fit(){
  const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;
  const d=Math.max(30,27/(0.93*camera.aspect));camera.userData.d=d;camera.updateProjectionMatrix();
}
addEventListener('resize',fit);fit();

// stars
{const g=new THREE.BufferGeometry(),a=[];for(let i=0;i<500;i++)a.push(rnd(-120,120),rnd(10,90),rnd(-120,-10));
g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));
scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:.6})));}

// lava
const lava=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xff4a00,emissive:0xff2a00,emissiveIntensity:1.2}));
lava.rotation.x=-Math.PI/2;lava.position.y=-6;scene.add(lava);

// tiles
const tiles=[];
const tileGeo=new THREE.BoxGeometry(S-.12,.4,S-.12);
for(let i=0;i<N;i++)for(let j=0;j<N;j++){
  const base=(i+j)%2?0x2b3a67:0x3f55a5;
  const mat=new THREE.MeshStandardMaterial({color:base,roughness:.5,emissive:0x000000});
  const mesh=new THREE.Mesh(tileGeo,mat);
  mesh.position.set((i+.5)*S-HALF,-.2,(j+.5)*S-HALF);scene.add(mesh);
  tiles.push({mesh,mat,base,orig:base,zone:(i>=N/2?1:0)+(j>=N/2?2:0),warn:0,fallen:false,vy:0});
}
const tileAt=(x,z)=>{const i=Math.floor((x+HALF)/S),j=Math.floor((z+HALF)/S);return(i<0||j<0||i>=N||j>=N)?null:tiles[i*N+j]};
function resetTiles(){for(const t of tiles){t.warn=0;t.fallen=false;t.vy=0;t.base=t.orig;t.mesh.position.y=-.2;t.mesh.visible=true;t.mat.color.setHex(t.base);t.mat.emissive.setHex(0)}}
// BRAIN MASTER zones: 0=A (top-left) 1=B (top-right) 2=C (bottom-left) 3=D (bottom-right)
const ZCOL=[0xd9304a,0x2f6bff,0x2fb457,0xe5b82a], ZHEX=['#ff5470','#5b8cff','#4fd37a','#ffd23d'], ZNAME=['A','B','C','D'];
const ZC=[[-5,-5],[5,-5],[-5,5],[5,5]];

// laser beams
const beams=[];
for(let i=0;i<3;i++){
  const m=new THREE.Mesh(new THREE.BoxGeometry(HALF*2+4,.35,.35),new THREE.MeshStandardMaterial({color:0xff2244,emissive:0xff1133,emissiveIntensity:2}));
  m.position.y=.7;m.visible=false;scene.add(m);beams.push(m);
}
const hub=new THREE.Mesh(new THREE.CylinderGeometry(.7,.9,1.6,16),new THREE.MeshStandardMaterial({color:0x333355,emissive:0x110022}));
hub.position.y=.8;hub.visible=false;scene.add(hub);

// CRAZY RACE objects
const RACE={startZ:8.5,finishZ:-8.5,RUN:2.1,limit:45};
const raceGroup=new THREE.Group();raceGroup.visible=false;scene.add(raceGroup);
const raceWalls=[];
[5,1,-3].forEach((z,i)=>{
  const m=new THREE.Mesh(new THREE.BoxGeometry(8,.8,.6),new THREE.MeshStandardMaterial({color:0xff8a00,emissive:0xaa4400,emissiveIntensity:.8}));
  m.position.set(0,.4,z);m.userData={ph:i*2.1,sp:1.1+i*.3};raceGroup.add(m);raceWalls.push(m);
});
const spinner=new THREE.Mesh(new THREE.BoxGeometry(12,.35,.35),new THREE.MeshStandardMaterial({color:0xcc33ff,emissive:0xaa22ff,emissiveIntensity:1.5}));
spinner.position.set(0,.6,-6.5);raceGroup.add(spinner);
const spHub=new THREE.Mesh(new THREE.CylinderGeometry(.5,.6,1.2,12),new THREE.MeshStandardMaterial({color:0x333355}));spHub.position.set(0,.6,-6.5);raceGroup.add(spHub);
for(const [z,c] of [[RACE.startZ+.9,0x44ff88],[RACE.finishZ-.9,0xffffff]]){
  const st=new THREE.Mesh(new THREE.PlaneGeometry(HALF*2,.9),new THREE.MeshBasicMaterial({color:c}));st.rotation.x=-Math.PI/2;st.position.set(0,.03,z);raceGroup.add(st);
}
let race=null;
function startRace(){
  race={t:0,finished:[],endT:null};raceGroup.visible=true;
  const arr=[...players.values()],n=arr.length;
  arr.forEach((p,i)=>{p.x=-HALF+1.2+(i+.5)*(HALF*2-2.4)/n;p.z=RACE.startZ;p.lat=0;p.target=null});
}
const spinHit=(p)=>{const f=spinner.rotation.y,dx=p.x-spinner.position.x,dz=p.z-spinner.position.z;
  return Math.abs(dx*(-Math.sin(f))-dz*Math.cos(f))<.55&&Math.abs(dx*Math.cos(f)-dz*Math.sin(f))<6.2};
function tickRace(dt){
  race.t+=dt;
  for(const w of raceWalls)w.position.x=Math.sin(race.t*w.userData.sp+w.userData.ph)*(HALF-4.2);
  spinner.rotation.y+=dt*(1.5+race.t*.03);
  for(const p of players.values()){
    if(!p.alive||p.finished)continue;
    let hit=false;
    if(p.hitCd<=0&&p.y<.95){
      for(const w of raceWalls){if(Math.abs(p.z-w.position.z)<.55&&Math.abs(p.x-w.position.x)<4.3){hit=true;break}}
      if(!hit&&Math.abs(p.z-spinner.position.z)<6.5&&spinHit(p)&&p.y<1)hit=true;
    }
    if(hit){p.z=Math.min(RACE.startZ,p.z+3.2);p.stun=.6;p.hitCd=.9;burst(p,0xff8a00,10);beep(180,.15,'sawtooth')}
    if(p.z<=RACE.finishZ+.3){p.finished=true;race.finished.push(p);p.z=RACE.finishZ;burst(p,0xffffff,20);beep(900,.2,'sine');if(race.endT===null)race.endT=2.5}
  }
  if(race.endT!==null){race.endT-=dt;if(race.endT<=0||race.finished.length>=3){endRound();return}}
  if(race.t>=RACE.limit)endRound();
}
function botRaceJump(p){
  for(const w of raceWalls){const dz=p.z-w.position.z;
    if(dz>.15&&dz<1.4&&Math.abs(p.x-w.position.x)<4.6&&Math.random()<p.skill){p.jumpT=.3;p.jcd=.7;return}}
  const dz=p.z-spinner.position.z;
  if(Math.abs(dz)<2.2&&spinHit({x:p.x,z:p.z+0})&&Math.random()<p.skill*.8){p.jumpT=.3;p.jcd=.7}
}

/* ---------- players ---------- */
const players=new Map(), queue=new Map(), uids=new Map();
let ws=null, allTime=[];
try{allTime=JSON.parse(localStorage.getItem('la_scores')||'[]')}catch{}
const NAMES=["سعيد","Yassine","Amina","Hamza","Salma","Reda","Imane","Anas","Sara","Ayoub","Hind","Mehdi","Nora","Zakaria","Lina","Omar","Kawtar","Walid","Meryem","Soufiane","Ilyass","Doha","Badr","Ghita"];
const hash=s=>{let h=7;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h};
function label(text,color){
  const c=document.createElement('canvas');c.width=300;c.height=80;const x=c.getContext('2d');
  x.fillStyle='rgba(0,0,0,.65)';x.beginPath();x.roundRect(4,8,292,64,28);x.fill();
  x.strokeStyle=color;x.lineWidth=4;x.stroke();
  x.fillStyle='#fff';x.font='bold 34px system-ui,Tahoma';x.textAlign='center';x.textBaseline='middle';
  x.fillText(text.length>14?text.slice(0,13)+'…':text,150,42);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));
  sp.scale.set(3.4,.9,1);sp.position.y=2.3;sp.renderOrder=10;return sp;
}
function addPlayer(name,bot){
  const hue=hash(name)%360, col=new THREE.Color(`hsl(${hue},80%,55%)`);
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.38,.6,6,12),new THREE.MeshStandardMaterial({color:col,roughness:.4}));body.position.y=.7;
  const head=new THREE.Mesh(new THREE.SphereGeometry(.34,16,12),new THREE.MeshStandardMaterial({color:0xffe0c4}));head.position.y=1.5;
  const eyes=new THREE.Mesh(new THREE.BoxGeometry(.4,.09,.1),new THREE.MeshBasicMaterial({color:0x111111}));eyes.position.set(0,1.55,.3);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.5,.07,8,24),new THREE.MeshBasicMaterial({color:0xffd23d}));halo.rotation.x=Math.PI/2;halo.position.y=2;halo.visible=false;
  g.add(body,head,eyes,halo,label(name,'#'+col.getHexString()));scene.add(g);
  const p={name,bot,mesh:g,color:col,x:0,y:0,z:0,vy:0,kx:0,kz:0,alive:true,dir:null,jumpT:0,wins:0,skill:rnd(.45,.92),think:0,jcd:0,lat:0,stun:0,hitCd:0,haloT:0,finished:false,halo};
  players.set(name,p);placePlayer(p);return p;
}
function placePlayer(p){
  p.x=rnd(-HALF+2,HALF-2);p.z=rnd(-HALF+2,HALF-2);p.y=0;p.vy=0;p.kx=p.kz=0;p.alive=true;p.dir=null;p.jumpT=0;p.target=null;p.lives=3;p.score=0;p.lat=0;p.stun=0;p.hitCd=0;p.finished=false;
  p.mesh.visible=true;p.mesh.rotation.set(0,0,0);p.mesh.scale.setScalar(1);
}
function eliminate(p,how){
  if(!p.alive)return;p.alive=false;p.diedAt=time;lastOut=p;
  if(how==='zap'){p.vy=10;p.kx=rnd(-7,7);p.kz=rnd(-7,7);burst(p,0xff3355,18);beep(120,.25,'sawtooth')}
  else{p.vy=Math.min(p.vy,0);p.kx=p.kz=0;beep(220,.2,'triangle')}
  feed('💥',p.name+' خرج!');
}
const hasGround=(x,z)=>(state==='round'&&mode==='fall')?(()=>{const t=tileAt(x,z);return t&&!t.fallen})():(Math.abs(x)<HALF+.3&&Math.abs(z)<HALF+.3);
function stepPlayer(p,dt){
  if(p.alive){
    if(state==='round'&&mode==='race'){
      p.stun-=dt;p.hitCd-=dt;p.dir=null;
      if(!p.finished){p.x+=p.lat*4*dt;if(p.stun<=0)p.z-=RACE.RUN*dt}
      p.mesh.rotation.y=Math.PI;
    }
    if(p.target){const dx=p.target[0]-p.x,dz=p.target[1]-p.z,d=Math.hypot(dx,dz);p.dir=d<.35?null:[dx/d,dz/d]}
    if(p.dir){p.x+=p.dir[0]*SPEED*dt;p.z+=p.dir[1]*SPEED*dt;p.mesh.rotation.y=Math.atan2(p.dir[0],p.dir[1])}
    const free=state==='round'&&mode==='fall';
    const lim=free?HALF+4:HALF-.4;p.x=clamp(p.x,-lim,lim);p.z=clamp(p.z,-lim,lim);
    const g=hasGround(p.x,p.z)?0:-1e9;
    if(p.y<=g&&p.vy<=0){p.y=g;p.vy=0}else{p.vy-=24*dt;p.y+=p.vy*dt}
    p.jumpT-=dt;if(p.jumpT>0&&p.y===0){p.vy=9;p.jumpT=0;beep(520,.08)}
    if(p.y<-1.2&&state==='round')eliminate(p,'fall');
  }else{
    p.vy-=24*dt;p.y+=p.vy*dt;p.x+=p.kx*dt;p.z+=p.kz*dt;p.mesh.rotation.z+=dt*6;
    if(p.y<-14)p.mesh.visible=false;
  }
  p.mesh.position.set(p.x,p.y,p.z);
}

/* ---------- particles / sound / hud helpers ---------- */
const parts=[];const pGeo=new THREE.SphereGeometry(.12,6,6);
function burst(p,color,n=24){for(let i=0;i<n;i++){const m=new THREE.Mesh(pGeo,new THREE.MeshBasicMaterial({color:color||Math.random()*0xffffff}));
  m.position.set(p.x,p.y+1,p.z);scene.add(m);parts.push({m,v:new THREE.Vector3(rnd(-5,5),rnd(3,9),rnd(-5,5)),life:rnd(.8,1.5)})}}
let ac;addEventListener('pointerdown',()=>{ac=ac||new (window.AudioContext||window.webkitAudioContext)()},{once:true});
function beep(f,d=.12,type='square'){if(!ac)return;const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.value=f;g.gain.value=.05;
  o.connect(g);g.connect(ac.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+d);o.stop(ac.currentTime+d)}
function feed(who,txt){const d=document.createElement('div');d.innerHTML=`<b></b> `;d.firstChild.textContent=who;d.append(txt);$('feed').append(d);while($('feed').children.length>6)$('feed').firstChild.remove();setTimeout(()=>d.remove(),9000)}
let toastT;function toast(t){$('toast').textContent=t;clearTimeout(toastT);toastT=setTimeout(()=>$('toast').textContent='',2500)}

/* ---------- game state ---------- */
let state='lobby',mode='fall',stateT=20,time=0,lastOut=null,votes=new Map(),winner=null;
let fall={t:0,next:1.5,interval:2.2},laser={t:0};
function setState(s,t){state=s;stateT=t}

function startLobby(){
  setState('lobby',params.get('fast')?4:20);resetTiles();winner=null;votes.clear();
  beams.forEach(b=>b.visible=false);hub.visible=false;
  for(const [k,v] of queue){if(players.size<MAXP&&!players.has(k))addPlayer(k,false)}queue.clear();
  for(const p of players.values())placePlayer(p);
}
function startVote(){setState('vote',params.get('fast')?2:10);votes.clear()}
const VOTE_MODE={RED:'fall',BLUE:'laser',GREEN:'brain',YELLOW:'race'};
function countVotes(){const c={RED:0,BLUE:0,GREEN:0,YELLOW:0};for(const v of votes.values())c[v]++;return c}
function startRound(){
  const c=countVotes(),mx=Math.max(c.RED,c.BLUE,c.GREEN,c.YELLOW);
  const top=Object.keys(c).filter(k=>c[k]===mx);
  mode=VOTE_MODE[top[Math.floor(Math.random()*top.length)]];
  if(params.get('force'))mode=params.get('force');   // اختبار: ?force=brain|fall|laser
  setState('round',999);fall={t:0,next:1.2,interval:2.0};laser={t:0};
  for(const p of players.values())placePlayer(p);
  if(mode==='laser'){beams.forEach((b,i)=>{b.visible=i===0});hub.visible=true}
  if(mode==='brain')startBrain();
  if(mode==='race')startRace();
  beep(660,.3);
}

/* ---------- BRAIN MASTER ---------- */
let brain=null;
function loadSeen(){try{return new Set(JSON.parse(localStorage.getItem('la_seen')||'[]'))}catch{return new Set()}}
function markSeen(q){const s=loadSeen();s.add(q[0]);try{localStorage.setItem('la_seen',JSON.stringify([...s]))}catch{}}
// 3 سهلة + 5 متوسطة + 4 صعيبة، من الأسئلة اللي ما تسقسات حتى مرة (إلا سالات الأسئلة كنبداو من جديد)
function pickQuestions(){
  const seen=loadSeen(),out=[];
  for(const [lvl,n] of [[1,3],[2,5],[3,4]]){
    let pool=LEVELS[lvl].filter(q=>!seen.has(q[0]));
    if(pool.length<n){for(const q of LEVELS[lvl])seen.delete(q[0]);try{localStorage.setItem('la_seen',JSON.stringify([...seen]))}catch{}pool=[...LEVELS[lvl]]}
    pool.sort(()=>Math.random()-.5);out.push(...pool.slice(0,n));
  }
  return out;
}
function startBrain(){
  for(const t of tiles){t.base=ZCOL[t.zone];t.mat.color.setHex(t.base);t.mat.emissive.setHex(0)}
  const qs=pickQuestions();
  brain={qs,qi:-1,phase:'reveal',t:1.5,q:null,answers:new Map(),dur:10,correct:0};
}
function nextQuestion(){
  brain.qi++;
  if(brain.qi>=brain.qs.length){const a=[...players.values()].filter(p=>p.alive).sort((x,y)=>y.lives-x.lives||y.score-x.score);endRound();return}
  const raw=brain.qs[brain.qi];markSeen(raw);const opts=raw.slice(1).map((t,i)=>({t,ok:i===0})).sort(()=>Math.random()-.5);
  brain.q={text:raw[0],opts};brain.correct=opts.findIndex(o=>o.ok);
  brain.dur=Math.max(8,13-Math.floor(brain.qi/3));brain.t=brain.dur;brain.phase='ask';brain.answers.clear();
  for(const t of tiles){t.base=ZCOL[t.zone];t.mat.color.setHex(t.base);t.mat.emissive.setHex(0)}
  for(const p of players.values()){p.answered=null;p.target=null;p.botDelay=rnd(1.2,brain.dur-2);p.botMiss=Math.random()<.06}
  beep(740,.15);
}
function setAnswer(p,idx){
  if(!brain||brain.phase!=='ask'||!p.alive)return;
  brain.answers.set(p.name,idx);p.answered=idx;p.target=ZC[idx];
}
function revealBrain(){
  brain.phase='reveal';brain.t=3.2;
  for(const t of tiles){if(t.zone===brain.correct){t.mat.emissive.setHex(0x22ff66)}else{t.mat.color.setHex(0x331018)}}
  for(const p of players.values()){
    if(!p.alive)continue;
    if(p.answered===brain.correct){p.score+=1;burst(p,0x44ff88,10)}
    else{p.lives--;burst(p,0xff3355,14);if(p.lives<=0)eliminate(p,'fall')}
  }
  beep(brain.qi%2?520:620,.25,'sine');
}
function tickBrain(dt){
  brain.t-=dt;
  if(brain.phase==='ask'){
    const el=brain.dur-brain.t;
    for(const p of players.values()){
      if(!p.bot||!p.alive||p.answered!=null||p.botMiss||el<p.botDelay)continue;
      const right=Math.random()<.3+p.skill*.55;
      let idx=brain.correct;if(!right){do{idx=Math.floor(Math.random()*4)}while(idx===brain.correct)}
      setAnswer(p,idx);
    }
    if(brain.t<=0)revealBrain();
  }else if(brain.t<=0){
    const alive=[...players.values()].filter(p=>p.alive);
    if(alive.length<=1)endRound();else nextQuestion();
  }
}
function computeRank(){
  const all=[...players.values()];
  const dead=(x,y)=>(y.diedAt||0)-(x.diedAt||0);
  if(mode==='race'&&race){
    const fin=race.finished,rest=all.filter(p=>!fin.includes(p)).sort((x,y)=>x.z-y.z);
    return [...fin,...rest];
  }
  const alive=all.filter(p=>p.alive);
  if(mode==='brain')alive.sort((x,y)=>y.lives-x.lives||y.score-x.score);
  return [...alive,...all.filter(p=>!p.alive).sort(dead)];
}
function endRound(){
  const rank=computeRank();let w=rank[0]||null;
  if(mode!=='race'&&rank.length>1&&!rank[0].alive)w=rank[0];   // الكل مات: آخر واحد خرج
  winner=w;setState('winner',8);resetTiles();beams.forEach(b=>b.visible=false);hub.visible=false;raceGroup.visible=false;
  if(w){w.wins++;w.alive=true;w.x=0;w.z=0;w.y=0;w.vy=0;w.mesh.rotation.set(0,0,0);w.mesh.visible=true;w.dir=null;w.target=null;w.lat=0;burst(w,0xffd23d,60);beep(880,.5,'sine')}
  reportResult(rank);
}
/* ---------- all-time scores (server or localStorage) ---------- */
function reportResult(rank){
  const pts=[10,6,3];
  const rows=rank.slice(0,3).map((p,i)=>({p,i})).filter(o=>!o.p.bot).map(o=>({user:o.p.name,uid:uids.get(o.p.name)||o.p.name,points:pts[o.i],win:o.i===0}));
  if(!rows.length)return;
  if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'result',mode,rows}));return}
  for(const r of rows){let e=allTime.find(x=>x.uid===r.uid);if(!e){e={uid:r.uid,user:r.user,wins:0,points:0};allTime.push(e)}e.points+=r.points;if(r.win)e.wins++}
  allTime.sort((x,y)=>y.points-x.points);try{localStorage.setItem('la_scores',JSON.stringify(allTime.slice(0,50)))}catch{}
}

/* ---------- chat commands ---------- */
const DIRS={U:[0,-1],UP:[0,-1],'فوق':[0,-1],D:[0,1],DOWN:[0,1],'تحت':[0,1],L:[-1,0],LEFT:[-1,0],'يسار':[-1,0],R:[1,0],RIGHT:[1,0],'يمين':[1,0]};
const VOTES={YELLOW:'YELLOW','أصفر':'YELLOW','اصفر':'YELLOW',RED:'RED','أحمر':'RED','احمر':'RED',BLUE:'BLUE','أزرق':'BLUE','ازرق':'BLUE',GREEN:'GREEN','أخضر':'GREEN','اخضر':'GREEN'};
const ANS={A:0,'1':0,'أ':0,B:1,'2':1,'ب':1,C:2,'3':2,'ج':2,D:3,'4':3,'د':3};
function join(user){
  if(players.has(user)||queue.has(user))return;
  if(players.size+queue.size>=MAXP){toast('الساحة عامرة 😅');return}
  if(state!=='lobby'){queue.set(user,1);toast(user+' فالانتظار للجولة الجاية');return}
  addPlayer(user,false);burst(players.get(user),players.get(user).color.getHex(),14);beep(700,.1);toast('🎮 '+user+' دخل!');
}
function onChat(user,text,quiet){
  text=String(text||'').trim();if(!text)return;if(!quiet)feed(user,text);
  const T=text.toUpperCase();
  if(state==='vote'){
    const v=VOTES[T];if(v){votes.set(user,v);return}
  }
  if(T==='JOIN'||T==='انضم'||T==='دخل'){join(user);return}
  const p=players.get(user);if(!p||!p.alive)return;
  if(state==='round'&&mode==='brain'){const a=ANS[T];if(a!==undefined)setAnswer(p,a);return}
  if(DIRS[T]){if(state==='round'&&mode==='race')p.lat=DIRS[T][0];else p.dir=DIRS[T]}
  else if(T==='STOP'||T==='وقف'){p.dir=null;p.lat=0}
  else if(T==='JUMP'||T==='J'||T==='قفز')p.jumpT=.3;
}
function onGift(user,m={}){   // تأثير بصري فقط — بلا أي أفضلية فاللعب
  const d=Number(m.diamonds)||1,p=players.get(user);
  toast(`🎁 ${user} · ${m.gift||'Gift'}${m.count>1?' ×'+m.count:''}`);
  if(p){burst(p,0xffd23d,d>=100?80:d>=10?50:24);p.haloT=Math.max(p.haloT,d>=100?120:d>=10?60:20)}
  if(d>=100)for(let i=0;i<5;i++)setTimeout(()=>burst({x:rnd(-8,8),y:rnd(2,6),z:rnd(-8,8)},null,36),i*250);
  beep(900,.2,'sine');
}

/* ---------- bots ---------- */
function botAI(p,dt){
  if(!p.alive||!p.bot)return;
  p.think-=dt;p.jcd-=dt;
  if(state==='vote'&&!votes.has(p.name)&&Math.random()<dt*.6)votes.set(p.name,['RED','BLUE','GREEN','YELLOW'][Math.floor(Math.random()*4)]);
  if(state==='round'&&mode==='brain')return;
  if(p.think>0)return;p.think=rnd(.35,1.1);
  if(state==='round'&&mode==='race'){let lat=[-1,0,0,1][Math.floor(Math.random()*4)];
    for(const w of raceWalls){const dz=p.z-w.position.z;if(dz>0&&dz<3.8&&Math.abs(p.x-w.position.x)<5.2&&Math.random()<p.skill){lat=p.x>=w.position.x?1:-1}}
    if(Math.abs(p.x)>8)lat=-Math.sign(p.x);p.lat=lat;p.think=rnd(.2,.5);return}
  const ds=Object.values(DIRS);
  if(state==='round'&&mode==='fall'){
    const cur=tileAt(p.x,p.z);
    if((!cur||cur.warn>0||cur.fallen)&&Math.random()<p.skill+.15){
      let best=null,bd=1e9;for(const t of tiles){if(t.warn>0||t.fallen)continue;const dx=t.mesh.position.x-p.x,dz=t.mesh.position.z-p.z,d=dx*dx+dz*dz;if(d<bd){bd=d;best=[dx,dz]}}
      if(best){const l=Math.hypot(best[0],best[1])||1;p.dir=[best[0]/l,best[1]/l];p.think=.25}
    }else if(Math.random()<.3)p.dir=ds[Math.floor(Math.random()*4)];
  }else if(Math.random()<.5)p.dir=ds[Math.floor(Math.random()*4)];
}
function botJump(p){
  if(state==='round'&&mode==='race'&&p.alive&&p.bot&&p.jcd<=0&&!p.finished){botRaceJump(p);return}
  if(state!=='round'||mode!=='laser'||!p.alive||!p.bot||p.jcd>0)return;
  for(const b of beams){if(!b.visible)continue;const f=b.rotation.y;
    const dist=Math.abs(p.x*(-Math.sin(f))-p.z*Math.cos(f));
    if(dist<1.6&&Math.random()<p.skill){p.jumpT=.3;p.jcd=.7;return}}
}

/* ---------- round logic ---------- */
function tickRound(dt){
  if(mode==='brain'){tickBrain(dt);return}
  if(mode==='race'){tickRace(dt);return}
  if(mode==='fall'){
    fall.t+=dt;
    if(fall.t>=fall.next){
      fall.next+=fall.interval;fall.interval=Math.max(.6,fall.interval*.93);
      const alive=[...players.values()].filter(p=>p.alive).length;
      const k=Math.min(22,3+Math.floor(fall.t/8)+Math.floor(alive/4));
      const cand=tiles.filter(t=>!t.fallen&&t.warn<=0);
      for(let i=0;i<k&&cand.length;i++){const t=cand.splice(Math.floor(Math.random()*cand.length),1)[0];t.warn=1.1;t.mat.color.setHex(0xff3b3b);beep(300,.06)}
    }
    for(const t of tiles){
      if(t.warn>0){t.warn-=dt;t.mat.emissive.setHex(Math.floor(time*12)%2?0xff0000:0x550000);if(t.warn<=0){t.fallen=true;t.vy=0;t.mat.emissive.setHex(0)}}
      if(t.fallen&&t.mesh.visible){t.vy-=20*dt;t.mesh.position.y+=t.vy*dt;if(t.mesh.position.y<-10)t.mesh.visible=false}
    }
  }else{
    laser.t+=dt;
    const sp=1.4+laser.t*.045;
    beams.forEach((b,i)=>{
      b.visible=i===0||(i===1&&laser.t>15)||(i===2&&laser.t>35);
      b.rotation.y+=dt*sp*(i===1?-1:1)+(i===2?dt*.4:0);
      if(!b.visible)return;
      const f=b.rotation.y;
      for(const p of players.values()){if(!p.alive)continue;
        const dist=Math.abs(p.x*(-Math.sin(f))-p.z*Math.cos(f));
        if(dist<.6&&p.y<1.0)eliminate(p,'zap');}
    });
  }
  const alive=[...players.values()].filter(p=>p.alive);
  if(alive.length<=1)endRound();
}

/* ---------- main loop ---------- */
let botT=0,hudT=0,prev=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min(.05,(now-prev)/1000);prev=now;time+=dt;
  stateT-=dt;
  if(state==='lobby'){
    botT-=dt;if(botT<=0&&$('bots').checked&&players.size<BOTMIN){botT=.7;const n=NAMES.find(n=>!players.has(n)&&!queue.has(n));if(n)addPlayer(n,true)}
    if(stateT<=0){players.size>=2?startVote():stateT=3}
  }else if(state==='vote'){if(stateT<=0)startRound()}
  else if(state==='round')tickRound(dt);
  else if(state==='winner'&&stateT<=0)startLobby();
  for(const p of players.values()){botAI(p,dt);botJump(p);stepPlayer(p,dt);if(p.haloT>0){p.halo.visible=true;p.halo.rotation.z+=dt*3;p.haloT-=dt}else p.halo.visible=false}
  for(let i=parts.length-1;i>=0;i--){const q=parts[i];q.life-=dt;q.v.y-=15*dt;q.m.position.addScaledVector(q.v,dt);if(q.life<=0){scene.remove(q.m);parts.splice(i,1)}}
  if(winner&&state==='winner'){winner.mesh.position.y=Math.abs(Math.sin(time*5))*1.2;winner.mesh.rotation.y+=dt*4}
  lava.material.emissiveIntensity=1+.4*Math.sin(time*3);
  const d=camera.userData.d;camera.position.set(Math.sin(time*.3)*2,d*.78,d*.62);camera.lookAt(0,0,1);
  hudT-=dt;if(hudT<=0){hudT=.15;hud()}
  renderer.render(scene,camera);
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let touchKind='';
function renderTouch(){
  if(!touch)return;
  const kind=state==='lobby'?'join':state==='vote'?'vote':state==='round'?(mode==='brain'?'brain':mode==='race'?'race':mode==='laser'?'laser':'fall'):'none';
  if(kind===touchKind)return;touchKind=kind;
  const B=(c,t,cls='',st='')=>`<button class="tb ${cls}" data-c="${c}" style="${st}">${t}</button>`;
  const pad='<div class="pad">'+B('UP','⬆️','','grid-area:1/2')+B('LEFT','⬅️','','grid-area:2/1')+B('STOP','⏹','sm','grid-area:2/2')+B('RIGHT','➡️','','grid-area:2/3')+B('DOWN','⬇️','','grid-area:3/2')+'</div>';
  $('touch').innerHTML={
    join:B('JOIN','🎮 JOIN','big'),
    vote:B('RED','🔴 FALL')+B('BLUE','🔵 LASER')+B('GREEN','🟢 BRAIN')+B('YELLOW','🟡 RACE'),
    brain:[...'ABCD'].map((l,i)=>B(l,l,'z'+i)).join(''),
    race:B('LEFT','⬅️')+B('JUMP','🦘','big')+B('RIGHT','➡️'),
    laser:pad+B('JUMP','🦘','big'),
    fall:pad,none:''}[kind];
}
$('touch').addEventListener('pointerdown',e=>{const b=e.target.closest('button');if(!b)return;e.preventDefault();onChat(myName,b.dataset.c,true)});
$('fs').addEventListener('click',()=>{try{(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen).call(document.documentElement)}catch{}});
addEventListener('pointerdown',()=>{try{navigator.wakeLock&&navigator.wakeLock.request('screen').catch(()=>{})}catch{}},{once:true});
function hud(){
  renderTouch();
  const all=[...players.values()],alive=all.filter(p=>p.alive).length;
  $('alive').textContent=`👥 ${state==='round'&&mode!=='race'?alive+' / ':''}${all.length}`;
  const t=Math.max(0,Math.ceil(stateT));let bt='',bs='',tm='';
  const brainOn=state==='round'&&mode==='brain'&&brain&&brain.q;
  if(state==='lobby'){bt='🎮 JOIN!';bs=esc(`اكتب JOIN فالتعليقات · الغرفة ${ROOM}`);tm=t}
  else if(state==='vote'){bt='🗳️ صوّت!';bs='🔴 RED = FALL · 🔵 BLUE = LASER<br>🟢 GREEN = BRAIN · 🟡 YELLOW = RACE';tm=t}
  else if(state==='round'&&mode==='brain'){
    if(brainOn){
      bt=brain.q.text;
      bs=brain.q.opts.map((o,i)=>{const hit=brain.phase==='reveal'&&i===brain.correct;
        return `<span style="color:${ZHEX[i]};${hit?'text-decoration:underline;font-weight:900':''}">${ZNAME[i]}) ${esc(o.t)}${hit?' ✅':''}</span>`}).join(' &nbsp;·&nbsp; ');
      tm=brain.phase==='ask'?Math.max(0,Math.ceil(brain.t)):'';
    }else{bt='BRAIN MASTER 🧠';bs='جاوب بـ A / B / C / D'}
  }
  else if(state==='round'&&mode==='race'){bt='CRAZY RACE 🏁';bs='LEFT / RIGHT للتحرك · JUMP للقفز فوق العراقيل';tm=race?Math.max(0,Math.ceil(RACE.limit-race.t)):''}
  else if(state==='round'){bt=mode==='fall'?'THE FALL 🕳️':'LASER 🔥';bs=mode==='fall'?'الأرضية كتطيح! تحرك: UP/DOWN/LEFT/RIGHT':'قفز على الليزر! اكتب JUMP'}
  else{bt=winner?`🏆 ${winner.name}`:'تعادل!';bs=winner?'هو الفائز!':'ما كاين حتى فائز';}
  $('bt').textContent=bt;$('bs').innerHTML=bs;$('timer').textContent=tm;
  $('votes').style.display=state==='vote'?'block':'none';
  if(state==='vote'){const c=countVotes(),tot=(c.RED+c.BLUE+c.GREEN+c.YELLOW)||1;
    for(const [id,k] of [['vr','RED'],['vb','BLUE'],['vg','GREEN'],['vy','YELLOW']])$(id).style.flex=Math.max(.5,c[k]/tot*4);
    $('vr').textContent=`🔴 ${c.RED}`;$('vb').textContent=`🔵 ${c.BLUE}`;$('vg').textContent=`🟢 ${c.GREEN}`;$('vy').textContent=`🟡 ${c.YELLOW}`}
  let top,title;
  if(state==='round'&&mode==='brain'){title='❤️ الأرواح';top=all.filter(p=>p.alive).sort((a,b)=>b.lives-a.lives||b.score-a.score).slice(0,6)
    .map((p,i)=>`<div><span>${i+1}. ${esc(p.name)}</span><b>${'❤️'.repeat(Math.max(0,p.lives))}</b></div>`)}
  else if(state==='round'&&mode==='race'){title='🏁 السباق';top=computeRank().slice(0,6)
    .map((p,i)=>`<div><span>${i+1}. ${esc(p.name)}</span><b>${p.finished?'🏁':Math.max(0,Math.min(99,Math.round((RACE.startZ-p.z)/(RACE.startZ-RACE.finishZ)*100)))+'%'}</b></div>`)}
  else{title='👑 الأبطال';top=allTime.slice(0,5)
    .map((p,i)=>`<div><span>${i+1}. ${esc(p.user)}</span><b>${p.points}⭐</b></div>`)}
  $('bt2').textContent=title;
  $('rows').innerHTML=top.length?top.join(''):'<div style="opacity:.6">—</div>';
}
requestAnimationFrame(loop);

/* ---------- inputs: simulator + websocket ---------- */
$('m').addEventListener('keydown',e=>{if(e.key==='Enter'){const u=$('u').value||'أنا',v=$('m').value;
  if(v.startsWith('/gift'))onGift(u,{gift:'Rose',diamonds:parseInt(v.slice(5))||1});else onChat(u,v);$('m').value=''}});
addEventListener('keydown',e=>{if(document.activeElement.tagName==='INPUT')return;
  const m={ArrowUp:'UP',ArrowDown:'DOWN',ArrowLeft:'LEFT',ArrowRight:'RIGHT',' ':'JUMP',j:'JOIN'}[e.key];if(m)onChat($('u').value||'أنا',m)});
let wsUrl=params.get('ws');
if(wsUrl==='auto')wsUrl=(location.protocol==='https:'?'wss://':'ws://')+location.host;
function connectWS(){if(!wsUrl)return;ws=new WebSocket(wsUrl);
  ws.onopen=()=>toast('✅ السيرفر متصل');
  ws.onmessage=e=>{try{const m=JSON.parse(e.data);
    if(m.type==='chat'){if(m.uid)uids.set(m.user,m.uid);onChat(m.user,m.text)}
    else if(m.type==='gift'){if(m.uid)uids.set(m.user,m.uid);onGift(m.user,m)}
    else if(m.type==='leaderboard')allTime=m.rows}catch{}};
  ws.onclose=()=>{ws=null;setTimeout(connectWS,3000)}}
connectWS();

if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
