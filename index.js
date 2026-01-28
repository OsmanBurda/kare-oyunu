const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = data.roomName || "OsmanOda";
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], mode: data.mode, 
            wave: 1, lastWaveTime: Date.now(),
            flags: { red: {x: 30, y: 30}, blue: {x: 345, y: 345} },
            scores: { red: 0, blue: 0 }, winner: null
        };
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName);
        socket.roomName = rName;
        let r = rooms[rName];
        let hpVal = (r.mode === 'zombi' ? 10 : (r.mode === 'savas' ? 3 : 1));
        let team = Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue';
        r.players[socket.id] = { 
            x: team === 'red' ? 50 : 330, y: team === 'red' ? 50 : 330, 
            name: uName || "Osman", team: team, hp: hpVal, maxHp: hpVal,
            lastFire: 0, lastBlast: 0, lastDir: 'up', hasFlag: false 
        };
        socket.emit('joined');
    }

    socket.on('specialPower', () => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id];
        // 80 birim menzilli B gücü
        if(r.mode === 'zombi' && p && p.hp > 0 && Date.now() - p.lastBlast > 3000) { 
            r.zombies = r.zombies.filter(z => Math.hypot(z.x - p.x, z.y - p.y) > 80);
            io.to(socket.roomName).emit('blastEffect', {x: p.x+12, y: p.y+12, range: 80});
            p.lastBlast = Date.now();
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r || r.winner) return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        let s = 20;
        if (dir === 'up' && p.y > 0) p.y -= s;
        if (dir === 'down' && p.y < 375) p.y += s;
        if (dir === 'left' && p.x > 0) p.x -= s;
        if (dir === 'right' && p.x < 375) p.x += s;
        p.lastDir = dir;
    });
});

setInterval(() => {
    for(let n in rooms) {
        let r = rooms[n];
        // Zombi Doğma Mantığı
        if(r.mode === 'zombi') {
            if(r.zombies.length < 5) {
                r.zombies.push({x: Math.random()*370, y: 0});
            }
            r.zombies.forEach(z => {
                let targets = Object.values(r.players).filter(p => p.hp > 0);
                if(targets[0]) {
                    z.x += (z.x < targets[0].x ? 1.5 : -1.5);
                    z.y += (z.y < targets[0].y ? 1.5 : -1.5);
                    if(Math.hypot(z.x-targets[0].x, z.y-targets[0].y) < 20) targets[0].hp -= 0.1;
                }
            });
        }
        io.to(n).emit('state', r);
    }
}, 50);

http.listen(process.env.PORT || 3000);
