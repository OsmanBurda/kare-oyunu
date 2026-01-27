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
    socket.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));

    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        rooms[rName] = { players: {}, bullets: [], zombies: [], mode: data.mode, status: 'lobby', leader: socket.id, wave: 1 };
        joinProcess(socket, rName, data.userName);
    });

    socket.on('joinExistingRoom', (data) => {
        if (!rooms[data.roomName] || rooms[data.roomName].status === 'playing') return;
        joinProcess(socket, data.roomName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName); socket.roomName = rName;
        let r = rooms[rName];
        r.players[socket.id] = { 
            id: socket.id, x: 185, y: 185, name: uName || "Kare", 
            color: '#' + Math.floor(Math.random()*16777215).toString(16),
            hp: (r.mode === 'zombi' ? 10 : 1), active: false, lastDir: 'up', lastFire: 0
        };
        socket.emit('joined', { isLeader: (r.leader === socket.id) });
        io.to(rName).emit('updatePlayerList', {players: Object.values(r.players), leaderId: r.leader});
        io.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));
    }

    // YÖNETİCİ PANELİ: Oyuncu Atma (Kick)
    socket.on('kickPlayer', (targetId) => {
        let r = rooms[socket.roomName];
        if(r && r.leader === socket.id && targetId !== socket.id) {
            if(io.sockets.sockets.get(targetId)) {
                io.sockets.sockets.get(targetId).leave(socket.roomName);
                delete r.players[targetId];
                io.to(socket.roomName).emit('updatePlayerList', {players: Object.values(r.players), leaderId: r.leader});
            }
        }
    });

    socket.on('startGameSignal', () => {
        let r = rooms[socket.roomName];
        if(r && r.leader === socket.id) {
            r.status = 'playing';
            for(let id in r.players) {
                let p = r.players[id]; p.active = true;
                if(r.mode === 'labirent') { p.x = 20; p.y = 350; }
                else { p.x = 20 + Math.random()*350; p.y = 20 + Math.random()*350; }
            }
            io.to(socket.roomName).emit('gameStarted');
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        let nX = p.x, nY = p.y;
        if (dir === 'up') nY -= 20; if (dir === 'down') nY += 20;
        if (dir === 'left') nX -= 20; if (dir === 'right') nX += 20;
        let walls = (r.mode === 'labirent' ? mazeWalls : []);
        let hit = walls.some(w => nX < w.x + w.w && nX + 25 > w.x && nY < w.y + w.h && nY + 25 > w.y);
        if (!hit && nX >= 5 && nX <= 370 && nY >= 0 && nY <= 375) { p.x = nX; p.y = nY; p.lastDir = dir; }
        if(r.mode === 'labirent' && p.y < 50 && p.x < 50) io.to(socket.roomName).emit('winner', p.name + " Kazandı!");
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id];
        let rate = (r.mode === 'savas' ? 1000 : 200);
        if(p && p.hp > 0 && Date.now() - p.lastFire > rate) {
            r.bullets.push({ x: p.x + 10, y: p.y + 10, dir: p.lastDir, owner: socket.id });
            p.lastFire = Date.now();
        }
    });

    setInterval(() => {
        for(let name in rooms) {
            let r = rooms[name]; if(r.status !== 'playing') continue;
            
            // ZOMBİ MANTIĞI VE DALGA SAYACI
            if(r.mode === 'zombi') {
                if(r.zombies.length === 0) r.wave++; 
                if(r.zombies.length < r.wave + 2) r.zombies.push({x: Math.random()*380, y: 10, hp: 1});
                
                r.zombies.forEach((z, zi) => {
                    let targets = Object.values(r.players).filter(p => p.hp > 0);
                    if(targets.length > 0) {
                        z.x += (z.x < targets[0].x ? 0.6 : -0.6); // Bizden yavaş
                        z.y += (z.y < targets[0].y ? 0.6 : -0.6);
                        if(Math.hypot(z.x - targets[0].x, z.y - targets[0].y) < 20) targets[0].hp -= 0.1;
                    }
                });
            }

            r.bullets.forEach((b, bi) => {
                b.x += (b.dir==='left'?-15:(b.dir==='right'?15:0)); b.y += (b.dir==='up'?-15:(b.dir==='down'?15:0));
                if(b.x<0||b.x>400||b.y<0||b.y>400) { r.bullets.splice(bi, 1); return; }
                
                // Zombilere ateş etme
                if(r.mode === 'zombi') {
                    r.zombies.forEach((z, zi) => {
                        if(b.x < z.x+25 && b.x+8 > z.x && b.y < z.y+25 && b.y+8 > z.y) {
                            r.zombies.splice(zi, 1); r.bullets.splice(bi, 1);
                        }
                    });
                }
                
                // Oyunculara ateş etme
                for(let id in r.players) {
                    let p = r.players[id];
                    if(id !== b.owner && p.hp > 0 && b.x < p.x+25 && b.x+8 > p.x && b.y < p.y+25 && b.y+8 > p.y) {
                        p.hp -= 1; r.bullets.splice(bi, 1); break;
                    }
                }
            });
            io.to(name).emit('state', { players: r.players, mode: r.mode, bullets: r.bullets, zombies: r.zombies, walls: (r.mode==='labirent'?mazeWalls:[]), wave: r.wave });
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);