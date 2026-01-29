const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let rooms = {};
const WALLS = [{x: 80, y: 120, w: 15, h: 160}, {x: 305, y: 120, w: 15, h: 160}];

const sendLobby = () => {
    io.emit('roomList', Object.keys(rooms).map(n => ({
        name: n, count: Object.keys(rooms[n].players).length, mode: rooms[n].mode, started: rooms[n].started
    })));
};

io.on('connection', (socket) => {
    sendLobby();

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
        let hp = (r.mode === 'vs' ? 3 : (r.mode === 'zombi' ? 10 : 1));

        socket.join(rName);
        socket.roomName = rName;
        r.players[socket.id] = { 
            id: socket.id, x: (team==='red'?40:340), y: 190, hp: hp, maxHP: hp,
            name: data.userName || "Osman", color: (team === 'red' ? 'red' : 'blue'), 
            team: team, hasFlag: false, lastFire: 0, lastDir: 'up'
        };
        socket.emit('joined', { isHost: (r.host === socket.id) });
        sendLobby();
    });

    socket.on('startGame', () => {
        let r = rooms[socket.roomName];
        if(r && r.host === socket.id) { r.started = true; io.to(socket.roomName).emit('gameStarted'); sendLobby(); }
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; let p = r?.players[socket.id];
        if(p && p.hp > 0 && r.started && !p.hasFlag && Date.now() - p.lastFire > 1000) {
            p.lastFire = Date.now();
            let bDirs = r.mode === 'bayrak' ? [[0,-10],[0,10],[-10,0],[10,0]] : [{up:[0,-10],down:[0,10],left:[-10,0],right:[10,0]}[p.lastDir]];
            bDirs.forEach(v => { if(v) r.bullets.push({x: p.x+10, y: p.y+10, dx: v[0], dy: v[1], owner: socket.id}); });
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; let p = r?.players[socket.id];
        if (p && p.hp > 0 && r.started) {
            let speed = p.hasFlag ? 8 : 14;
            let nx = p.x + (dir==='left'?-speed:dir==='right'?speed:0);
            let ny = p.y + (dir==='up'?-speed:dir==='down'?speed:0);
            p.lastDir = dir;
            let hit = false;
            if(r.mode === 'bayrak') WALLS.forEach(w => { if(nx<w.x+w.w && nx+25>w.x && ny<w.y+w.h && ny+25>w.y) hit = true; });
            if(!hit) { p.x = Math.max(0, Math.min(375, nx)); p.y = Math.max(0, Math.min(375, ny)); }
        }
    });

    setInterval(() => {
        for (let n in rooms) {
            let r = rooms[n]; if(!r.started) { io.to(n).emit('state', r); continue; }
            if(r.mode === 'zombi') {
                if(r.zombies.length === 0) { for(let i=0; i<r.wave*3; i++) r.zombies.push({x:Math.random()*400, y:-30}); r.wave++; }
                r.zombies.forEach(z => {
                    let t = Object.values(r.players)[0];
                    if(t) { z.x += (z.x < t.x ? 0.5 : -0.5); z.y += (z.y < t.y ? 0.5 : -0.5); }
                });
            }
            io.to(n).emit('state', r);
        }
    }, 50);

    socket.on('disconnect', () => { if(socket.roomName) { delete rooms[socket.roomName]?.players[socket.id]; sendLobby(); } });
});
http.listen(process.env.PORT || 3000);
