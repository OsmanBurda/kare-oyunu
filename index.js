const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname)));

let rooms = {};
// Kalıcı Duvar Koordinatları (Bayrak modunda üs koruması için)
const WALLS = [
    {x: 80, y: 120, w: 15, h: 160}, // Kırmızı üs önü
    {x: 305, y: 120, w: 15, h: 160} // Mavi üs önü
];

function getZombieSpawn() {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: Math.random() * 400, y: -40 };
    if (side === 1) return { x: Math.random() * 400, y: 440 };
    if (side === 2) return { x: -40, y: Math.random() * 400 };
    return { x: 440, y: Math.random() * 400 };
}

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = data.roomName;
        if (!rooms[rName]) {
            rooms[rName] = { 
                players: {}, bullets: [], zombies: [], mode: data.mode, wave: 1,
                flags: { red: {x: 30, y: 190, taken: false}, blue: {x: 350, y: 190, taken: false} },
                scores: { red: 0, blue: 0 }, started: false, host: socket.id
            };
        }
        let r = rooms[rName];
        let team = (r.mode === 'bayrak') ? (Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue') : 'solo';
        
        // Osman'ın Özel HP Ayarları
        let initialHP = 1;
        if(r.mode === 'vs') initialHP = 3;
        if(r.mode === 'zombi') initialHP = 10;

        socket.join(rName);
        socket.roomName = rName;
        r.players[socket.id] = { 
            id: socket.id, x: (team==='red'?40:340), y: 190, hp: initialHP, maxHP: initialHP,
            name: data.userName || "Osman", color: (team === 'red' ? 'red' : 'blue'), 
            team: team, hasFlag: false, lastFire: 0, lastDir: 'up'
        };
        socket.emit('joined', { mode: r.mode, room: rName, isHost: (r.host === socket.id) });
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; let p = r?.players[socket.id];
        // Bayrak tutarken ateş edemez kuralı [cite: 2026-01-27]
        if(p && p.hp > 0 && r.started && !p.hasFlag && Date.now() - p.lastFire > 1000) {
            p.lastFire = Date.now();
            let bDirs = r.mode === 'bayrak' ? [[0,-10],[0,10],[-10,0],[10,0]] : [{up:[0,-10],down:[0,10],left:[-10,0],right:[10,0]}[p.lastDir]];
            bDirs.forEach(v => { if(v) r.bullets.push({x: p.x+10, y: p.y+10, dx: v[0], dy: v[1], owner: socket.id}); });
        }
    });

    socket.on('adminAction', (data) => {
        if(data.pw !== "123Osman123Burda") return;
        let r = rooms[socket.roomName]; if(!r) return;
        if(data.type === 'kick') { delete r.players[data.targetId]; }
        if(data.type === 'nuke') { r.zombies = []; }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; let p = r?.players[socket.id];
        if (p && p.hp > 0 && r.started) {
            p.lastDir = dir;
            let speed = p.hasFlag ? 7 : 12;
            let nx = p.x, ny = p.y;
            if(dir==='up') ny -= speed; if(dir==='down') ny += speed;
            if(dir==='left') nx -= speed; if(dir==='right') nx += speed;
            
            // Duvar Çarpışması (Bayrak modunda aktif)
            let canMove = true;
            if(r.mode === 'bayrak') {
                WALLS.forEach(w => {
                    if(nx < w.x + w.w && nx + 25 > w.x && ny < w.y + w.h && ny + 25 > w.y) canMove = false;
                });
            }
            if(canMove) { p.x = Math.max(0, Math.min(375, nx)); p.y = Math.max(0, Math.min(375, ny)); }
        }
    });

    setInterval(() => {
        for (let n in rooms) {
            let r = rooms[n]; if(!r.started) { io.to(n).emit('state', r); continue; }
            
            // Zombi Hızı 0.5 [cite: 2026-01-28]
            if(r.mode === 'zombi') {
                if(r.zombies.length === 0) { for(let i=0; i<r.wave*4; i++) r.zombies.push(getZombieSpawn()); r.wave++; }
                r.zombies.forEach(z => {
                    let t = Object.values(r.players)[0];
                    if(t) { z.x += (z.x < t.x ? 0.5 : -0.5); z.y += (z.y < t.y ? 0.5 : -0.5); }
                });
            }
            io.to(n).emit('state', r);
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);
