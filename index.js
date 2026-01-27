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

// Odaları listelemek için yardımcı fonksiyon
function getRoomList() {
    let list = [];
    for(let name in rooms) {
        list.push({ name: name, mode: rooms[name].mode, count: Object.keys(rooms[name].players).length });
    }
    return list;
}

io.on('connection', (socket) => {
    // Bağlanan herkese mevcut odaları gönder
    socket.emit('roomList', getRoomList());

    socket.on('createRoom', (data) => {
        const rName = data.roomName;
        if (rooms[rName]) return socket.emit('err', 'Bu oda zaten var!');
        
        rooms[rName] = { players: {}, bullets: [], zombies: [], mode: data.mode, wave: 1, spawned: 0 };
        joinProcess(socket, rName, data.userName);
    });

    socket.on('joinExistingRoom', (data) => {
        if (!rooms[data.roomName]) return socket.emit('err', 'Oda artık mevcut değil!');
        joinProcess(socket, data.roomName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName);
        socket.roomName = rName;
        let r = rooms[rName];
        r.players[socket.id] = { 
            x: 200, y: 200, name: uName || "Adsız", 
            color: '#' + Math.floor(Math.random()*16777215).toString(16),
            hp: (r.mode === 'zombi' ? 10 : 3), active: true, lastDir: 'up', lastFire: 0, lastBlast: 0 
        };
        io.emit('roomList', getRoomList()); // Oda listesini güncelle
    }

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        p.lastDir = dir;
        let nX = p.x, nY = p.y;
        if (dir === 'up') nY -= 20; if (dir === 'down') nY += 20;
        if (dir === 'left') nX -= 20; if (dir === 'right') nX += 20;
        let walls = (r.mode === 'labirent') ? mazeWalls : [];
        let hit = walls.some(w => nX < w.x + w.w && nX + 25 > w.x && nY < w.y + w.h && nY + 25 > w.y);
        if (!hit && nX >= 5 && nX <= 370 && nY >= 0 && nY <= 375) { p.x = nX; p.y = nY; }
        if (r.mode === 'labirent' && p.y <= 15) io.to(socket.roomName).emit('winner', p.name + " KAZANDI!");
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r || r.mode === 'labirent') return;
        let p = r.players[socket.id];
        if(p && p.hp > 0 && Date.now() - p.lastFire > 150) {
            r.bullets.push({ x: p.x + 10, y: p.y + 10, dir: p.lastDir, owner: socket.id });
            p.lastFire = Date.now();
        }
    });

    socket.on('areaBlast', () => {
        let r = rooms[socket.roomName]; if(!r || r.mode !== 'zombi') return;
        let p = r.players[socket.id];
        if(p && p.hp > 0 && Date.now() - p.lastBlast > 15000) {
            p.lastBlast = Date.now();
            r.zombies = r.zombies.filter(z => Math.hypot(p.x - z.x, p.y - z.y) > 80);
            io.to(socket.roomName).emit('blastEffect', { x: p.x + 12, y: p.y + 12 });
        }
    });

    socket.on('disconnect', () => {
        if(socket.roomName && rooms[socket.roomName]) {
            delete rooms[socket.roomName].players[socket.id];
            if (Object.keys(rooms[socket.roomName].players).length === 0) delete rooms[socket.roomName];
            io.emit('roomList', getRoomList());
        }
    });
});

setInterval(() => {
    for(let name in rooms) {
        let r = rooms[name];
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
                    if(minDist < 20 && Math.random() > 0.97) target.hp -= 1;
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
                    if(id !== b.owner && p.hp > 0 && b.x < p.x+25 && b.x+8 > p.x && b.y < p.y+25 && b.y+8 > p.y) {
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