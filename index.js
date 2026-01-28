const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        rooms[rName] = { players: {}, zombies: [], mode: 'zombi', status: 'playing', wave: 1 };
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName);
        socket.roomName = rName;
        rooms[rName].players[socket.id] = { id: socket.id, x: 185, y: 185, hp: 10, lastSpecial: 0, color: 'deeppink' };
        socket.emit('joined');
    }

    // ÖZEL GÜÇ KİLİDİ: 15 SANİYE & 80 MENZİL
    socket.on('specialPower', () => {
        let r = rooms[socket.roomName];
        let p = r?.players[socket.id];
        if(p && Date.now() - p.lastSpecial > 15000) { 
            p.lastSpecial = Date.now();
            io.to(socket.roomName).emit('specialEffect', {x: p.x + 12, y: p.y + 12});
            r.zombies = r.zombies.filter(z => Math.hypot(z.x - p.x, z.y - p.y) > 80);
        }
    });

    socket.on('move', (dir) => {
        let p = rooms[socket.roomName]?.players[socket.id];
        if(p) {
            if (dir === 'up') p.y -= 20; if (dir === 'down') p.y += 20;
            if (dir === 'left') p.x -= 20; if (dir === 'right') p.x += 20;
            p.x = Math.max(0, Math.min(375, p.x)); p.y = Math.max(0, Math.min(375, p.y));
        }
    });

    setInterval(() => {
        for(let n in rooms) {
            let r = rooms[n];
            r.zombies.forEach(z => {
                let target = Object.values(r.players)[0];
                if(target) {
                    // ZOMBİ HIZI 0.5 OLARAK GÜNCELLENDİ VE KİLİTLENDİ
                    z.x += (z.x < target.x ? 0.5 : -0.5);
                    z.y += (z.y < target.y ? 0.5 : -0.5);
                    if(Math.hypot(z.x - target.x, z.y - target.y) < 20) target.hp -= 0.05;
                }
            });
            if(r.zombies.length < r.wave + 3) r.zombies.push({x: Math.random()*380, y: 0});
            io.to(n).emit('state', { players: r.players, zombies: r.zombies, wave: r.wave });
        }
    }, 50);
});

http.listen(process.env.PORT || 3000);
