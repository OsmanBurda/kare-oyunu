const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = "OsmanOda";
        if (!rooms[rName]) {
            rooms[rName] = { 
                players: {}, bullets: [], zombies: [], mode: data.mode || 'zombi', 
                wave: 1, scores: { red: 0, blue: 0 }, winner: null
            };
        }
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName);
        socket.roomName = rName;
        let r = rooms[rName];
        let team = Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue';
        let hpVal = r.mode === 'zombi' ? 10 : 3;
        r.players[socket.id] = { 
            x: 200, y: 200, team: team, hp: hpVal, lastDir: 'up', lastFire: 0, lastBlast: 0
        };
    }

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        const s = 15;
        if (dir === 'up' && p.y > 10) p.y -= s;
        if (dir === 'down' && p.y < 380) p.y += s;
        if (dir === 'left' && p.x > 10) p.x -= s;
        if (dir === 'right' && p.x < 380) p.x += s;
        p.lastDir = dir;
    });

    socket.on('specialPower', () => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id];
        if(r.mode === 'zombi' && p && p.hp > 0 && Date.now() - p.lastBlast > 3000) { 
            r.zombies = r.zombies.filter(z => Math.hypot(z.x - (p.x+12), z.y - (p.y+12)) > 80);
            io.to(socket.roomName).emit('blastEffect', {x: p.x+12, y: p.y+12, range: 80});
            p.lastBlast = Date.now();
        }
    });

    socket.on('disconnect', () => {
        if(socket.roomName && rooms[socket.roomName]) {
            delete rooms[socket.roomName].players[socket.id];
        }
    });
});

setInterval(() => {
    for(let n in rooms) {
        let r = rooms[n];
        if(r.mode === 'zombi' && r.zombies.length < 6) r.zombies.push({x: Math.random()*380, y: 0});
        r.zombies.forEach(z => {
            let targets = Object.values(r.players).filter(p => p.hp > 0);
            if(targets[0]) {
                z.x += (z.x < targets[0].x ? 2.5 : -2.5); z.y += (z.y < targets[0].y ? 2.5 : -2.5);
                if(Math.hypot(z.x-targets[0].x, z.y-targets[0].y) < 20) targets[0].hp -= 0.1;
            }
        });
        io.to(n).emit('state', r);
    }
}, 50);

http.listen(process.env.PORT || 3000);
