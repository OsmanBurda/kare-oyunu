const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    pingTimeout: 30000,
    pingInterval: 10000
});

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = "OsmanOda";
        if (!rooms[rName]) {
            rooms[rName] = { 
                players: {}, bullets: [], zombies: [], mode: data.mode || 'zombi', 
                wave: 1, scores: { red: 0, blue: 0 }, winner: null,
                flags: { red: {x: 30, y: 30}, blue: {x: 345, y: 345} }
            };
        }
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName);
        socket.roomName = rName;
        let r = rooms[rName];
        let team = Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue';
        let hpVal = r.mode === 'zombi' ? 10 : (r.mode === 'savas' ? 3 : 1);
        
        r.players[socket.id] = { 
            x: team === 'red' ? 50 : 330, y: team === 'red' ? 50 : 330, 
            name: uName || "Osman", team: team, hp: hpVal, maxHp: hpVal,
            lastFire: 0, lastBlast: 0, lastDir: 'up', hasFlag: false 
        };
        socket.emit('joined');
    }

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        const s = 15;
        if (dir === 'up' && p.y > 5) p.y -= s;
        if (dir === 'down' && p.y < 370) p.y += s;
        if (dir === 'left' && p.x > 5) p.x -= s;
        if (dir === 'right' && p.x < 370) p.x += s;
        p.lastDir = dir;
    });

    socket.on('disconnect', () => {
        for(let n in rooms) if(rooms[n].players[socket.id]) delete rooms[n].players[socket.id];
    });
});

setInterval(() => {
    for(let n in rooms) {
        let r = rooms[n];
        if(r.mode === 'zombi' && r.zombies.length < 10) r.zombies.push({x: Math.random()*370, y: 0});
        r.zombies.forEach(z => {
            let targets = Object.values(r.players).filter(p => p.hp > 0);
            if(targets[0]) {
                z.x += (z.x < targets[0].x ? 2 : -2); z.y += (z.y < targets[0].y ? 2 : -2);
                if(Math.hypot(z.x-targets[0].x, z.y-targets[0].y) < 20) targets[0].hp -= 0.1;
            }
        });
        io.to(n).emit('state', r);
    }
}, 50);

http.listen(process.env.PORT || 3000);
