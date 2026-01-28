const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], 
            mode: data.mode, status: 'playing', wave: 1,
            redScore: 0, blueScore: 0
        };
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName);
        socket.roomName = rName;
        let r = rooms[rName];
        let team = (r.mode === 'bayrak' || r.mode === 'vs') ? (Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue') : 'solo';
        r.players[socket.id] = { 
            id: socket.id, x: 185, y: 185, hp: (r.mode === 'vs' ? 3 : 10), 
            name: uName || "Osman", color: (team === 'red' ? 'red' : 'blue'), 
            lastSpecial: 0, lastFire: 0, lastDir: 'up', team: team
        };
        socket.emit('joined', { mode: r.mode });
    }

    // ATEŞ SİSTEMİ (4 YÖNLÜ)
    socket.on('fire', () => {
        let r = rooms[socket.roomName];
        let p = r?.players[socket.id];
        if (p && Date.now() - p.lastFire > 1000) { // 1 saniye cooldown
            p.lastFire = Date.now();
            const dirs = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] };
            let d = dirs[p.lastDir];
            r.bullets.push({ x: p.x+10, y: p.y+10, dx: d[0]*5, dy: d[1]*5, owner: socket.id });
        }
    });

    // ESKİ GÜZEL ÖZEL GÜÇ VE 15 SN KİLİDİ
    socket.on('specialPower', () => {
        let r = rooms[socket.roomName];
        let p = r?.players[socket.id];
        if (p && Date.now() - p.lastSpecial > 15000) {
            p.lastSpecial = Date.now();
            io.to(socket.roomName).emit('specialEffect', { x: p.x + 12, y: p.y + 12 });
            // Zombi modunda 80 birim alan hasarı
            if (r.mode === 'zombi') {
                r.zombies = r.zombies.filter(z => Math.hypot(z.x - p.x, z.y - p.y) > 80);
            }
        }
    });

    socket.on('move', (dir) => {
        let p = rooms[socket.roomName]?.players[socket.id];
        if (p) {
            p.lastDir = dir;
            if (dir === 'up') p.y -= 20; if (dir === 'down') p.y += 20;
            if (dir === 'left') p.x -= 20; if (dir === 'right') p.x += 20;
            p.x = Math.max(0, Math.min(375, p.x)); p.y = Math.max(0, Math.min(375, p.y));
        }
    });

    setInterval(() => {
        for (let n in rooms) {
            let r = rooms[n];
            // Mermi Hareketleri
            r.bullets.forEach((b, i) => {
                b.x += b.dx; b.y += b.dy;
                if (b.x < 0 || b.x > 400 || b.y < 0 || b.y > 400) r.bullets.splice(i, 1);
            });
            // Zombi Hızı Kilitlendi: 0.5
            if (r.mode === 'zombi') {
                r.zombies.forEach(z => {
                    let target = Object.values(r.players)[0];
                    if (target) {
                        z.x += (z.x < target.x ? 0.5 : -0.5);
                        z.y += (z.y < target.y ? 0.5 : -0.5);
                        if (Math.hypot(z.x - target.x, z.y - target.y) < 20) target.hp -= 0.05;
                    }
                });
                if (r.zombies.length < r.wave + 3) r.zombies.push({ x: Math.random()*380, y: 0 });
            }
            io.to(n).emit('state', { players: r.players, zombies: r.zombies, bullets: r.bullets, mode: r.mode });
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);
