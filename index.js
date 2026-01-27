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
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], 
            mode: data.mode, status: 'lobby', leader: socket.id, 
            wave: 1, scores: {red: 0, blue: 0} 
        };
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName); socket.roomName = rName;
        let r = rooms[rName];
        // OSMAN KURALI: Savaş modunda 3 can
        let hp = (r.mode === 'zombi' ? 10 : (r.mode === 'savas' ? 3 : 1)); 
        r.players[socket.id] = { 
            id: socket.id, x: 185, y: 185, 
            name: uName || "Osman", 
            hp: hp, lastDir: 'up', lastFire: 0 
        };
        io.to(rName).emit('updatePlayerList', {players: Object.values(r.players), leaderId: r.leader});
    }

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; let p = r?.players[socket.id];
        if(!p || p.hp <= 0 || r.mode === 'bayrak') return; 

        // OSMAN KURALI: Savaş modunda 1 saniye (1000ms) cooldown
        let cooldown = (r.mode === 'savas' ? 1000 : 200);
        
        if(Date.now() - p.lastFire > cooldown) {
            // OSMAN KURALI: 4 tarafa ateş etme
            ['up', 'down', 'left', 'right'].forEach(d => {
                r.bullets.push({ x: p.x + 10, y: p.y + 10, dir: d, owner: socket.id });
            });
            p.lastFire = Date.now();
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        let nX = p.x, nY = p.y;
        if (dir === 'up') nY -= 20; if (dir === 'down') nY += 20; if (dir === 'left') nX -= 20; if (dir === 'right') nX += 20;
        if (nX >= 5 && nX <= 370 && nY >= 0 && nY <= 375) { p.x = nX; p.y = nY; p.lastDir = dir; }
    });

    setInterval(() => {
        for(let n in rooms) {
            let r = rooms[n]; if(r.status !== 'playing') continue;
            // Mermi hareketleri...
            r.bullets.forEach((b, bi) => {
                b.x += (b.dir==='left'?-15:(b.dir==='right'?15:0)); b.y += (b.dir==='up'?-15:(b.dir==='down'?15:0));
            });
            io.to(n).emit('state', { players: r.players, mode: r.mode, bullets: r.bullets, zombies: r.zombies });
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);
