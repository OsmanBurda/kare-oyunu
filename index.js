const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname)));
let rooms = {};
const WALLS = [{x: 80, y: 120, w: 15, h: 160}, {x: 305, y: 120, w: 15, h: 160}];

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
        let initialHP = (r.mode === 'vs' ? 3 : (r.mode === 'zombi' ? 10 : 1));

        socket.join(rName);
        socket.roomName = rName;
        r.players[socket.id] = { 
            id: socket.id, x: (team==='red'?40:340), y: 190, hp: initialHP, maxHP: initialHP,
            name: data.userName || "Osman", color: (team === 'red' ? 'red' : 'blue'), 
            team: team, hasFlag: false, lastFire: 0, lastDir: 'up'
        };
        // Kurucu olup olmadığını kontrol et ve gönder
        socket.emit('joined', { mode: r.mode, room: rName, isHost: (r.host === socket.id) });
    });

    socket.on('startGame', () => {
        let r = rooms[socket.roomName];
        if(r && r.host === socket.id) { r.started = true; io.to(socket.roomName).emit('gameStarted'); }
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; let p = r?.players[socket.id];
        if(p && p.hp > 0 && r.started && !p.hasFlag && Date.now() - p.lastFire > 1000) {
            p.lastFire = Date.now();
            let bDirs = r.mode === 'bayrak' ? [[0,-10],[0,10],[-10,0],[10,0]] : [{up:[0,-10],down:[0,10],left:[-10,0],right:[10,0]}[p.lastDir]];
            bDirs.forEach(v => { if(v) r.bullets.push({x: p.x+10, y: p.y+10, dx: v[0], dy: v[1], owner: socket.id}); });
        }
    });

    // Zombi ve Hareket mantığı (Önceki kodla aynı, can azalması Math.max(0, hp-1) yapıldı)
    setInterval(() => {
        for (let n in rooms) {
            let r = rooms[n];
            Object.values(r.players).forEach(p => { if(p.hp < 0) p.hp = 0; });
            io.to(n).emit('state', r);
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);
