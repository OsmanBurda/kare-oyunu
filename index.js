const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

let rooms = {}; 
const mazeWalls = [{ x: 0, y: 300, w: 340, h: 10 }, { x: 60, y: 220, w: 340, h: 10 }, { x: 0, y: 140, w: 340, h: 10 }, { x: 60, y: 60, w: 340, h: 10 }];

io.on('connection', (socket) => {
    socket.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));

    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        if (rooms[rName]) return socket.emit('err', 'Oda zaten var!');
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], mode: data.mode, status: 'lobby', leader: socket.id 
        };
        joinProcess(socket, rName, data.userName);
    });

    socket.on('joinExistingRoom', (data) => {
        if (!rooms[data.roomName] || rooms[data.roomName].status === 'playing') return socket.emit('err', 'Giriş kapalı!');
        joinProcess(socket, data.roomName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName); socket.roomName = rName;
        let r = rooms[rName];
        let initialHp = (r.mode === 'zombi' ? 10 : 1); // 1 HP ayarı kalıcı
        
        r.players[socket.id] = { 
            x: 185, y: 185, name: uName || "Kare", 
            color: '#' + Math.floor(Math.random()*16777215).toString(16),
            hp: initialHp, active: false, lastDir: 'up', lastFire: 0, lastBlast: 0 
        };
        
        socket.emit('joined', { isLeader: (r.leader === socket.id) });
        io.to(rName).emit('updatePlayerList', Object.values(r.players).map(p => ({name: p.name})));
        io.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));
    }

    socket.on('startGameSignal', () => {
        let r = rooms[socket.roomName];
        if(r && r.leader === socket.id && r.status === 'lobby') {
            r.status = 'playing';
            for(let id in r.players) { 
                let p = r.players[id]; p.active = true; 
                // Savaş modunda rastgele doğma kalıcı
                p.x = 20 + Math.random() * 350; p.y = 20 + Math.random() * 350; 
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
        let walls = (r.mode === 'labirent') ? mazeWalls : [];
        let hit = walls.some(w => nX < w.x + w.w && nX + 25 > w.x && nY < w.y + w.h && nY + 25 > w.y);
        if (!hit && nX >= 5 && nX <= 370 && nY >= 0 && nY <= 375) { p.x = nX; p.y = nY; p.lastDir = dir; }
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id];
        let fireRate = (r.mode === 'savas') ? 1000 : 150; // Savaş modu 1 saniye cooldown
        if(p && p.hp > 0 && Date.now() - p.lastFire > fireRate) {
            r.bullets.push({ x: p.x + 10, y: p.y + 10, dir: p.lastDir, owner: socket.id });
            p.lastFire = Date.now();
        }
    });

    socket.on('areaBlast', () => { // 'b' tuşu özel gücü kalıcı
        let r = rooms[socket.roomName]; if(!r || r.mode !== 'zombi') return;
        let p = r.players[socket.id];
        if(p && p.hp > 0 && Date.now() - p.lastBlast > 15000) {
            p.lastBlast = Date.now();
            r.zombies = r.zombies.filter(z => Math.hypot(p.x - z.x, p.y - z.y) > 80);
        }
    });

    socket.on('disconnect', () => {
        if(socket.roomName && rooms[socket.roomName]) {
            let r = rooms[socket.roomName]; delete r.players[socket.id];
            if (Object.keys(r.players).length === 0) { delete rooms[socket.roomName]; }
            else {
                if(r.leader === socket.id) r.leader = Object.keys(r.players)[0];
                io.to(socket.roomName).emit('updatePlayerList', Object.values(r.players).map(p => ({name: p.name})));
            }
            io.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));
        }
    });

    setInterval(() => {
        for(let name in rooms) {
            let r = rooms[name]; if(r.status !== 'playing') continue;
            if(r.mode === 'zombi') {
                if(r.zombies.length < 5) r.zombies.push({x: Math.random()*380, y: Math.random()*380});
                r.zombies.forEach(z => {
                    let targets = Object.values(r.players).filter(p => p.hp > 0);
                    if(targets.length > 0) { z.x += z.x < targets[0].x ? 1 : -1; z.y += z.y < targets[0].y ? 1 : -1; }
                });
            }
            r.bullets.forEach((b, bi) => {
                b.x += (b.dir==='left'?-15:(b.dir==='right'?15:0)); b.y += (b.dir==='up'?-15:(b.dir==='down'?15:0));
                for(let id in r.players) {
                    let p = r.players[id];
                    if(id !== b.owner && p.hp > 0 && b.x < p.x+25 && b.x+8 > p.x && b.y < p.y+25 && b.y+8 > p.y) {
                        p.hp -= 1; r.bullets.splice(bi, 1); break;
                    }
                }
            });
            io.to(name).emit('state', { players: r.players, mode: r.mode, bullets: r.bullets, zombies: r.zombies, walls: (r.mode==='labirent'?mazeWalls:[]) });
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);