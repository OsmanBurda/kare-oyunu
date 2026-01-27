const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

let rooms = {};
const mazeWalls = [{ x: 0, y: 300, w: 300, h: 15 }, { x: 100, y: 200, w: 300, h: 15 }, { x: 0, y: 100, w: 300, h: 15 }];

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        rooms[rName] = { players: {}, bullets: [], zombies: [], mode: data.mode, status: 'lobby', leader: socket.id, scores: { red: 0, blue: 0 } };
        joinProcess(socket, rName, data.userName);
    });

    socket.on('joinExistingRoom', (data) => {
        if (rooms[data.roomName]) joinProcess(socket, data.roomName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName); socket.roomName = rName;
        let r = rooms[rName];
        let hpVal = (r.mode === 'zombi' ? 10 : (r.mode === 'savas' ? 3 : 1));
        r.players[socket.id] = { 
            x: 185, y: 185, name: uName || "Osman", 
            color: '#' + Math.floor(Math.random()*16777215).toString(16), 
            hp: hpVal, maxHp: hpVal, lastFire: 0, lastDir: 'up',
            team: (Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue')
        };
        socket.emit('joined', { isLeader: (r.leader === socket.id) });
        io.to(rName).emit('updatePlayerList', Object.values(r.players).map(p => ({name: p.name})));
    }

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id];
        let cd = (r.mode === 'savas' ? 1000 : 250);

        if(p && p.hp > 0 && Date.now() - p.lastFire > cd) {
            if(r.mode === 'bayrak') {
                ['up','down','left','right'].forEach(d => r.bullets.push({x: p.x+8, y: p.y+8, dir: d, owner: socket.id}));
            } else {
                r.bullets.push({x: p.x+8, y: p.y+8, dir: p.lastDir, owner: socket.id});
            }
            p.lastFire = Date.now();
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        if (dir === 'up') p.y -= 20; if (dir === 'down') p.y += 20;
        if (dir === 'left') p.x -= 20; if (dir === 'right') p.x += 20;
        p.lastDir = dir;
    });

    socket.on('adminChangeMode', (m) => {
        let r = rooms[socket.roomName];
        if(r) { r.mode = m; for(let id in r.players) { r.players[id].hp = (m==='zombi'?10:(m==='savas'?3:1)); r.players[id].maxHp = r.players[id].hp; } }
    });

    socket.on('startGameSignal', () => { if(rooms[socket.roomName]) rooms[socket.roomName].status = 'playing'; io.to(socket.roomName).emit('gameStarted'); });
    socket.on('disconnect', () => { if(socket.roomName && rooms[socket.roomName]) { delete rooms[socket.roomName].players[socket.id]; if(Object.keys(rooms[socket.roomName].players).length === 0) delete rooms[socket.roomName]; } });
});

setInterval(() => {
    for(let n in rooms) {
        let r = rooms[n]; if(r.status !== 'playing') continue;
        if(r.mode === 'zombi') {
            if(r.zombies.length < 5) r.zombies.push({x: Math.random()*380, y: 0});
            r.zombies.forEach(z => {
                let targets = Object.values(r.players).filter(p => p.hp > 0);
                if(targets[0]) { z.x += (z.x < targets[0].x ? 0.8 : -0.8); z.y += (z.y < targets[0].y ? 0.8 : -0.8); if(Math.hypot(z.x-targets[0].x, z.y-targets[0].y) < 20) targets[0].hp -= 0.05; }
            });
        }
        r.bullets.forEach((b, i) => {
            if(b.dir==='up') b.y-=15; else if(b.dir==='down') b.y+=15; else if(b.dir==='left') b.x-=15; else if(b.dir==='right') b.x+=15;
            if(b.x<0 || b.x>400 || b.y<0 || b.y>400) r.bullets.splice(i, 1);
            for(let id in r.players) {
                let t = r.players[id];
                if(id !== b.owner && t.hp > 0 && b.x < t.x+25 && b.x+8 > t.x && b.y < t.y+25 && b.y+8 > t.y) { t.hp -= 1; r.bullets.splice(i, 1); }
            }
        });
        io.to(n).emit('state', { players: r.players, bullets: r.bullets, zombies: r.zombies, mode: r.mode, walls: (r.mode==='labirent'?mazeWalls:[]) });
    }
}, 50);

http.listen(process.env.PORT || 3000);
