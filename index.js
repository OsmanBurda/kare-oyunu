const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

let rooms = {}; 
const mazeWalls = [{ x: 0, y: 300, w: 340, h: 10 }, { x: 60, y: 220, w: 340, h: 10 }, { x: 0, y: 140, w: 340, h: 10 }, { x: 60, y: 60, w: 340, h: 10 }, { x: 0, y: 0, w: 5, h: 400 }, { x: 395, y: 0, w: 5, h: 400 }];

function getRandomSpawnPos() {
    const side = Math.floor(Math.random() * 4);
    if(side === 0) return {x: Math.random() * 400, y: -40};
    if(side === 1) return {x: Math.random() * 400, y: 440};
    if(side === 2) return {x: -40, y: Math.random() * 400};
    return {x: 440, y: Math.random() * 400};
}

io.on('connection', (socket) => {
    socket.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length, status:rooms[k].status})));

    socket.on('adminVerify', (pass) => {
        let r = rooms[socket.roomName];
        if(r && r.players[socket.id] && pass === "123Osman123Burda") {
            r.players[socket.id].isAdmin = true;
            r.players[socket.id].hp = 999;
            socket.emit('adminSuccess');
        }
    });

    socket.on('createRoom', (data) => {
        const rName = data.roomName;
        if (rooms[rName]) return socket.emit('err', 'Oda var!');
        rooms[rName] = { players: {}, bullets: [], zombies: [], mode: data.mode, wave: 1, spawned: 0, status: 'lobby', leader: socket.id };
        joinProcess(socket, rName, data.userName);
    });

    socket.on('joinExistingRoom', (data) => {
        if (!rooms[data.roomName] || rooms[data.roomName].status === 'playing') return socket.emit('err', 'Giriş başarısız!');
        joinProcess(socket, data.roomName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName); socket.roomName = rName;
        rooms[rName].players[socket.id] = { x: 200, y: 200, name: uName || "Kare", color: '#' + Math.floor(Math.random()*16777215).toString(16), hp: (rooms[rName].mode==='zombi'?10:3), active: false, lastDir: 'up', lastFire: 0, lastBlast: 0, isAdmin: false };
        socket.emit('joined', { isLeader: (rooms[rName].leader === socket.id) });
        io.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length, status:rooms[k].status})));
    }

    socket.on('startGameSignal', () => {
        let r = rooms[socket.roomName];
        if(r && r.leader === socket.id) {
            r.status = 'playing';
            for(let id in r.players) { r.players[id].active = true; if(r.mode==='labirent'){r.players[id].x=180; r.players[id].y=360;} }
            io.to(socket.roomName).emit('gameStarted');
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        p.lastDir = dir;
        let speed = p.isAdmin ? 40 : 20;
        let nX = p.x, nY = p.y;
        if (dir === 'up') nY -= speed; if (dir === 'down') nY += speed;
        if (dir === 'left') nX -= speed; if (dir === 'right') nX += speed;
        let walls = (r.mode === 'labirent') ? mazeWalls : [];
        let hit = walls.some(w => nX < w.x + w.w && nX + 25 > w.x && nY < w.y + w.h && nY + 25 > w.y);
        if (!hit && nX >= 5 && nX <= 370 && nY >= 0 && nY <= 375) { p.x = nX; p.y = nY; }
        if (r.mode === 'labirent' && p.y <= 15) io.to(socket.roomName).emit('winner', p.name + " KAZANDI!");
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r || r.mode === 'labirent' || r.status !== 'playing') return;
        let p = r.players[socket.id];
        if(p && p.hp > 0 && Date.now() - p.lastFire > 150) {
            r.bullets.push({ x: p.x + 10, y: p.y + 10, dir: p.lastDir, owner: socket.id });
            p.lastFire = Date.now();
        }
    });

    socket.on('areaBlast', () => {
        let r = rooms[socket.roomName]; if(!r || r.mode !== 'zombi' || r.status !== 'playing') return;
        let p = r.players[socket.id];
        let cd = p.isAdmin ? 1000 : 15000;
        if(p && p.hp > 0 && Date.now() - p.lastBlast > cd) {
            p.lastBlast = Date.now();
            r.zombies = r.zombies.filter(z => Math.hypot(p.x - z.x, p.y - z.y) > 80);
            io.to(socket.roomName).emit('blastEffect', { x: p.x + 12, y: p.y + 12 });
        }
    });

    socket.on('disconnect', () => {
        if(socket.roomName && rooms[socket.roomName]) {
            delete rooms[socket.roomName].players[socket.id];
            if (Object.keys(rooms[socket.roomName].players).length === 0) delete rooms[socket.roomName];
            io.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length, status:rooms[k].status})));
        }
    });
});

setInterval(() => {
    for(let name in rooms) {
        let r = rooms[name]; if(r.status !== 'playing') continue;
        if(r.mode === 'zombi') {
            let maxZ = 3 + (r.wave * 2);
            if(r.zombies.length < maxZ && r.spawned < maxZ) {
                let pos = getRandomSpawnPos();
                r.zombies.push({ x: pos.x, y: pos.y, hp: 1 + Math.floor(r.wave/3) });
                r.spawned++;
            }
            if(r.zombies.length === 0 && r.spawned >= maxZ) { r.wave++; r.spawned = 0; }
            r.zombies.forEach(z => {
                let target = null; let minDist = 1000;
                for(let id in r.players) {
                    let p = r.players[id]; if(p.hp <= 0) continue;
                    let d = Math.hypot(p.x - z.x, p.y - z.y);
                    if(d < minDist) { minDist = d; target = p; }
                }
                if(target) {
                    if(z.x < target.x) z.x += 1.2; else z.x -= 1.2;
                    if(z.y < target.y) z.y += 1.2; else z.y -= 1.2;
                    if(minDist < 20 && Math.random() > 0.97 && !target.isAdmin) target.hp -= 1;
                }
            });
        }
        r.bullets.forEach((b, bi) => {
            if (b.dir === 'up') b.y -= 15; else if (b.dir === 'down') b.y += 15;
            else if (b.dir === 'left') b.x -= 15; else if (b.dir === 'right') b.x += 15;
            r.zombies.forEach((z, zi) => {
                if(b.x < z.x+25 && b.x+8 > z.x && b.y < z.y+25 && b.y+8 > z.y) {
                    z.hp -= 1; r.bullets.splice(bi, 1);
                    if(z.hp <= 0) r.zombies.splice(zi, 1);
                }
            });
            if(r.mode === 'savas') {
                for(let id in r.players) {
                    let p = r.players[id];
                    if(id !== b.owner && p.hp > 0 && !p.isAdmin && b.x < p.x+25 && b.x+8 > p.x && b.y < p.y+25 && b.y+8 > p.y) {
                        p.hp -= 1; r.bullets.splice(bi, 1); break;
                    }
                }
            }
        });
        io.to(name).emit('state', { players: r.players, walls: (r.mode === 'labirent' ? mazeWalls : []), bullets: r.bullets, zombies: r.zombies, mode: r.mode, wave: r.wave });
    }
}, 50);

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0');