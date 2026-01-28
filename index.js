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
    socket.emit('roomList', Object.keys(rooms).filter(r => rooms[r].status === 'lobby'));

    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        if (rooms[rName]) return;
        rooms[rName] = { players: {}, bullets: [], zombies: [], mode: data.mode, status: 'lobby', leader: socket.id, wave: 1 };
        joinProcess(socket, rName, data.userName);
        io.emit('roomList', Object.keys(rooms).filter(r => rooms[r].status === 'lobby'));
    });

    socket.on('joinExistingRoom', (data) => {
        if (rooms[data.roomName] && rooms[data.roomName].status === 'lobby') joinProcess(socket, data.roomName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName); socket.roomName = rName;
        let r = rooms[rName];
        let hp = (r.mode === 'zombi' ? 10 : (r.mode === 'savas' ? 3 : 1));
        r.players[socket.id] = { id: socket.id, x: 185, y: 185, name: uName || "Kare", color: '#' + Math.floor(Math.random()*16777215).toString(16), hp: hp, lastDir: 'up', lastFire: 0, lastSpecial: 0 };
        socket.emit('joined', { isLeader: (r.leader === socket.id), mode: r.mode });
        io.to(rName).emit('updatePlayerList', {players: Object.values(r.players)});
    }

    socket.on('specialPower', () => {
        let r = rooms[socket.roomName]; 
        if(!r || r.mode === 'savas' || r.mode === 'labirent') return; 
        let p = r.players[socket.id];
        // BEKLEME SÜRESİ AZALTILDI: 5 saniyeden 1 saniyeye
        if(p && p.hp > 0 && Date.now() - p.lastSpecial > 1000) { 
            p.lastSpecial = Date.now();
            io.to(socket.roomName).emit('specialEffect', {x: p.x + 12, y: p.y + 12});
            // MENZİL ARTIRILDI: 120 -> 160
            if(r.mode === 'zombi') r.zombies = r.zombies.filter(z => Math.hypot(z.x - p.x, z.y - p.y) > 160);
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        let nX = p.x, nY = p.y;
        if (dir === 'up') nY -= 20; if (dir === 'down') nY += 20; if (dir === 'left') nX -= 20; if (dir === 'right') nX += 20;
        let walls = (r.mode === 'labirent' ? mazeWalls : []);
        if (!walls.some(w => nX < w.x+w.w && nX+25 > w.x && nY < w.y+w.h && nY+25 > w.y) && nX >= 5 && nX <= 370 && nY >= 0 && nY <= 375) { p.x = nX; p.y = nY; p.lastDir = dir; }
    });

    socket.on('startGameSignal', () => {
        let r = rooms[socket.roomName];
        if(r && r.leader === socket.id) {
            r.status = 'playing';
            io.emit('roomList', Object.keys(rooms).filter(rn => rooms[rn].status === 'lobby'));
            for(let id in r.players) { 
                let p = r.players[id]; 
                if(r.mode === 'zombi') { p.x = 185; p.y = 185; }
                else { p.x = (r.mode === 'labirent' ? 20 : 20 + Math.random()*350); p.y = (r.mode === 'labirent' ? 350 : 20 + Math.random()*350); }
            }
            io.to(socket.roomName).emit('gameStarted');
        }
    });

    setInterval(() => {
        for(let n in rooms) {
            let r = rooms[n]; if(r.status !== 'playing') continue;
            if(r.mode === 'zombi') {
                if(r.zombies.length === 0) r.wave++; 
                if(r.zombies.length < r.wave + 2) {
                    let side = Math.floor(Math.random() * 4);
                    let zX, zY;
                    if(side === 0) { zX = Math.random() * 380; zY = 0; }
                    else if(side === 1) { zX = Math.random() * 380; zY = 380; }
                    else if(side === 2) { zX = 0; zY = Math.random() * 380; }
                    else { zX = 380; zY = Math.random() * 380; }
                    r.zombies.push({x: zX, y: zY});
                }
                r.zombies.forEach(z => { 
                    let targets = Object.values(r.players).filter(p => p.hp > 0); 
                    if(targets.length > 0) { 
                        // ZOMBİ HIZI DAHA DA DÜŞÜRÜLDÜ: 0.4 -> 0.25
                        z.x += (z.x < targets[0].x ? 0.25 : -0.25); 
                        z.y += (z.y < targets[0].y ? 0.25 : -0.25); 
                        if(Math.hypot(z.x - targets[0].x, z.y - targets[0].y) < 20) targets[0].hp -= 0.1; 
                    } 
                });
            }
            r.bullets.forEach((b, bi) => {
                b.x += (b.dir==='left'?-15:(b.dir==='right'?15:0)); b.y += (b.dir==='up'?-15:(b.dir==='down'?15:0));
                if(r.mode === 'zombi') r.zombies.forEach((z, zi) => { if(b.x < z.x+25 && b.x+8 > z.x && b.y < z.y+25 && b.y+8 > z.y) { r.zombies.splice(zi, 1); r.bullets.splice(bi, 1); } });
                for(let id in r.players) { let p = r.players[id]; if(id !== b.owner && p.hp > 0 && b.x < p.x+25 && b.x+8 > p.x && b.y < p.y+25 && b.y+8 > p.y) { p.hp -= 1; r.bullets.splice(bi, 1); break; } }
            });
            io.to(n).emit('state', { players: r.players, mode: r.mode, bullets: r.bullets, zombies: r.zombies, walls: (r.mode==='labirent'?mazeWalls:[]), wave: r.wave });
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);
