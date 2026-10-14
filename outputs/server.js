// Small dependency-free WebSocket game server. Run with: node server.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const rooms = new Map();
const clients = new Set();
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const file = pathname === '/' ? 'index.html' : path.basename(pathname);
  const full = path.join(ROOT, file);
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full).slice(1)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
function send(c, obj) {
  if (c.dead) return;
  const payload = Buffer.from(JSON.stringify(obj));
  let head;
  if (payload.length < 126) head = Buffer.from([0x81, payload.length]);
  else if (payload.length < 65536) { head = Buffer.alloc(4); head[0]=0x81; head[1]=126; head.writeUInt16BE(payload.length,2); }
  else { head=Buffer.alloc(10); head[0]=0x81; head[1]=127; head.writeBigUInt64BE(BigInt(payload.length),2); }
  c.socket.write(Buffer.concat([head,payload]));
}
function roomState(room) { return { type: 'state', players: room.players.map(p=>p && ({id:p.id,x:p.x,y:p.y,hp:p.hp,aim:p.aim,alive:p.alive,score:p.score})), bullets: room.bullets, started: room.players.every(Boolean), winner: room.winner }; }
function broadcast(room) { const s=roomState(room); room.players.forEach(p=>p&&p.client&&send(p.client,s)); }
function createRoom(code) { return {code,players:[null,null],bullets:[],winner:null}; }
function leave(c) {
  if (c.dead) return; c.dead=true; clients.delete(c);
  if (c.room) { const r=c.room; if (r.players[c.slot]?.client===c) r.players[c.slot].client=null; r.players[c.slot]=null; r.bullets=[]; r.winner=null; broadcast(r); if (!r.players[0]&&!r.players[1]) rooms.delete(r.code); }
  try { c.socket.end(); } catch {}
}
function frame(obj) {
  const data=Buffer.from(JSON.stringify(obj));
  let h;
  if(data.length<126) h=Buffer.from([0x81, data.length]);
  else { h=Buffer.alloc(4); h[0]=0x81;h[1]=126;h.writeUInt16BE(data.length,2); }
  return Buffer.concat([h,data]);
}
server.on('upgrade',(req,socket)=>{
  const key=req.headers['sec-websocket-key']; if(!key) return socket.destroy();
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');
  const c={socket,buffer:Buffer.alloc(0),dead:false,room:null,slot:-1,input:{}}; clients.add(c);
  socket.on('data',chunk=>{ c.buffer=Buffer.concat([c.buffer,chunk]); parse(c); });
  socket.on('close',()=>leave(c)); socket.on('error',()=>leave(c));
});
function parse(c) {
  while(c.buffer.length>=2) {
    const b0=c.buffer[0], b1=c.buffer[1]; let len=b1&127, off=2;
    if(len===126){if(c.buffer.length<4)return;len=c.buffer.readUInt16BE(2);off=4;} else if(len===127){if(c.buffer.length<10)return;len=Number(c.buffer.readBigUInt64BE(2));off=10;}
    const masked=!!(b1&128); if(masked) off+=4; if(c.buffer.length<off+len)return;
    const mask=masked?c.buffer.subarray(off-4,off):null, payload=Buffer.from(c.buffer.subarray(off,off+len)); c.buffer=c.buffer.subarray(off+len);
    if(mask) for(let i=0;i<payload.length;i++) payload[i]^=mask[i%4];
    if((b0&15)===8) return leave(c); if((b0&15)!==1) continue;
    let msg; try{msg=JSON.parse(payload.toString());}catch{continue;} handle(c,msg);
  }
}
function handle(c,m) {
  if(m.type==='join'&&!c.room) {
    const code=String(m.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6); if(code.length!==6)return send(c,{type:'error',message:'Enter a 6-character room code.'});
    let r=rooms.get(code); if(!r){r=createRoom(code);rooms.set(code,r);} let slot=r.players.findIndex(p=>!p);
    if(slot<0)return send(c,{type:'error',message:'That room is full.'});
    const p={id:slot,x:slot===0?480:2720,y:450,hp:100,aim:slot===0?0:Math.PI,alive:true,score:0,client:c}; r.players[slot]=p;c.room=r;c.slot=slot;
    send(c,{type:'joined',id:slot,code,world:{w:1600,h:900}}); broadcast(r); return;
  }
  if(m.type==='input'&&c.room) { c.input={x:+m.x||0,y:+m.y||0,aim:+m.aim||0,fire:!!m.fire}; }
  if(m.type==='restart'&&c.room&&c.room.players.filter(Boolean).length===2) { const r=c.room;r.winner=null;r.bullets=[];r.players.forEach((p,i)=>{p.x=i===0?480:2720;p.y=450;p.hp=100;p.alive=true;});broadcast(r); }
}
const W=3200,H=900;
setInterval(()=>{
  for(const r of rooms.values()) {
    if(!r.players[0]||!r.players[1]||r.winner) continue;
    for(const p of r.players) {
      if(!p.alive||!p.client)continue;
      const i=p.client.input||{}, speed=6;
      p.x=Math.max(34,Math.min(W-34,p.x+(i.x||0)*speed));p.y=Math.max(34,Math.min(H-34,p.y+(i.y||0)*speed));
      if(Number.isFinite(i.aim))p.aim=i.aim;
      if(i.fire&&(!p.lastShot||Date.now()-p.lastShot>240)) {p.lastShot=Date.now();r.bullets.push({x:p.x+Math.cos(p.aim)*28,y:p.y+Math.sin(p.aim)*28,vx:Math.cos(p.aim)*12,vy:Math.sin(p.aim)*12,owner:p.id,life:100});}
    }
    for(const b of r.bullets){b.x+=b.vx;b.y+=b.vy;b.life--;const target=r.players[1-b.owner];if(target?.alive&&Math.hypot(b.x-target.x,b.y-target.y)<30){target.hp-=20;b.life=0;if(target.hp<=0){target.hp=0;target.alive=false;r.players[b.owner].score++;r.winner=b.owner;}}}
    r.bullets=r.bullets.filter(b=>b.life>0&&b.x>=0&&b.x<=W&&b.y>=0&&b.y<=H);
    broadcast(r);
  }
},33);
server.listen(PORT,'0.0.0.0',()=>console.log(`Neon Divide ready on port ${PORT}`));
