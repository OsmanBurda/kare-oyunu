const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

let rooms = {}; 

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        rooms[rName] = { players: {}, zombies: [], mode: data.mode, status: 'playing', wave: 1 };
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName); socket.roomName = rName;
        rooms[rName].players[socket.id] = { id: socket.id, x: 185, y: 185, name: uName, color: 'blue', hp: 10, lastSpecial: 0 };
        socket.emit('joined');
    }

    // ÖZEL GÜÇ KİLİDİ: 15 SANİYE & 80 MENZİL
    socket.on('specialPower', () => {
        let r = rooms[socket.roomName];
        let p = r?.players[socket.id];
        if(p && Date.now() - p.lastSpecial > 15000) { // 15 Saniye Kilitli
            p.lastSpecial = Date.now();
            io.to(socket.roomName).emit('specialEffect', {x: p.x + 12, y: p.y + 12});
            // ALAN HASARI KİLİDİ: 80 Birim
            r.zombies = r.zombies.filter(z => Math.hypot(z.x - p.x, z.y - p.y) > 80);
        }
    });

    socket.on('move', (dir) => {
        let p = rooms[socket.roomName]?.players[socket.id];
        if(p) {
            if (dir === 'up') p.y -= 20; if (dir === 'down') p.y += 20;
            if (dir === 'left') p.x -= 20; if (dir === 'right') p.x += 20;
        }
    });

    setInterval(() => {
        for(let n in rooms) {
            let r = rooms[n];
            // ZOMBİ HIZI KİLİDİ: 0.4
            r.zombies.forEach(z => {
                let p = Object.values(r.players)[0];
                if(p) {
                    z.x += (z.x < p.x ? 0.4 : -0.4);
                    z.y += (z.y < p.y ? 0.4 : -0.4);
                    if(Math.hypot(z.x-p.x, z.y-p.y) < 20) p.hp -= 0.05;
                }
            });
            if(r.zombies.length < r.wave + 3) r.zombies.push({x: Math.random()*380, y: 0});
            io.to(n).emit('state', { players: r.players, zombies: r.zombies });
        }
    }, 50);
});
http.listen(3000);
