const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

let rooms = {}; 
const mazeWalls = [{ x: 0, y: 300, w: 340, h: 10 }, { x: 60, y: 220, w: 340, h: 10 }, { x: 0, y: 140, w: 340, h: 10 }, { x: 60, y: 60, w: 340, h: 10 }, { x: 0, y: 0, w: 5, h: 400 }, { x: 395, y: 0, w: 5, h: 400 }];
const baseWalls = [{x: 0, y: 80, w: 100, h: 10}, {x: 300, y: 310, w: 100, h: 10}];

io.on('connection', (socket) => {
    socket.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length, status:rooms[k].status})));

    socket.on('adminVerify', (pass) => {
        if(pass && pass.trim() === "123Osman123Burda") {
            let r = rooms[socket.roomName];
            if(r && r.players[socket.id]) {
                r.players[socket.id].isAdmin = true;
                r.players[socket.id].hp = 999;
                socket.emit('adminSuccess');
            }
        }
    });

    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda";
        if (rooms[rName]) return socket.emit('err', 'Oda var!');
        rooms[rName] = { players: {}, bullets: [], zombies: [], mode: data.mode, wave: 1, spawned: 0, status: 'lobby', leader: socket.id, flag: {x:185, y:185, carrier:null} };
        joinProcess(socket, rName, data.userName, data.team);
    });

    socket.on('joinExistingRoom', (data) => {
        if (!rooms[data.roomName] || rooms[data.roomName].status === 'playing') return socket.emit('err', 'Giriş kapalı!');
        joinProcess(socket, data.roomName, data.userName, data.team);
    });

    function joinProcess(socket, rName, uName, team) {
        socket.join(rName); socket.roomName = rName;
        let initialHp = (rooms[rName].mode === 'zombi' ? 10 : (rooms[rName].mode === 'bayrak' ? 1 : 3));
        let teamColor = team === 'Kırmızı' ? '#ff4444' : (team === 'Mavi' ? '#4444ff' : '#' + Math.floor(Math.random()*16777215).toString(16));
        
        rooms[rName].players[socket.id] = { 
            x: 185, y: 185, name: uName || "Kare", color: teamColor, 
            team: team, hp: initialHp, score:0, active: false, 
            lastDir: 'up', lastFire: 0, lastBlast: 0, isAdmin: false 
        };
        socket.emit('joined', { isLeader: (rooms[rName].leader === socket.id) });
        io.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length, status:rooms[k].status})));
    }

    socket.on('startGameSignal', () => {
        let r = rooms[socket.roomName];
        if(r && r.leader === socket.id) {
            r.status = 'playing';
            for(let id in r.players) { 
                let p = r.players[id];
                p.active = true; 
                if(r.mode === 'labirent') { p.x = 180; p.y = 360; }
                else if(r.mode === 'bayrak') {
                    p.x = p.team === 'Kırmızı' ? 20 : 350;
                    p.y = p.team === 'Kırmızı' ? 20 : 350;
                } else { p.x = 20 + Math.random() * 350; p.y = 20 + Math.random() * 350; }
            }
            io.to(socket.roomName).emit('gameStarted');
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        let speed = p.isAdmin ? 40 : (r.flag.carrier === socket.id ? 10 : 20);
        let nX = p.x, nY = p.y;
        if (dir === 'up') nY -= speed; if (dir === 'down') nY += speed;
        if (dir === 'left') nX -= speed; if (dir === 'right') nX += speed;
        
        let walls = (r.mode === 'labirent') ? mazeWalls : (r.mode === 'bayrak' ? baseWalls : []);
        let hit = walls.some(w => nX < w.x + w.w && nX + 25 > w.x && nY < w.y + w.h && nY + 25 > w.y);
        if (!hit && nX >= 5 && nX <= 370 && nY >= 0 && nY <= 375) { p.x = nX; p.y = nY; p.lastDir = dir; }

        if(r.mode === 'bayrak' && !r.flag.carrier && Math.hypot(p.x - r.flag.x, p.y - r.flag.y) < 30) r.flag.carrier = socket.id;
        if (r.mode === 'labirent' && p.y <= 15) io.to(socket.roomName).emit('winner', p.name + " KAZANDI!");
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r || r.mode === 'labirent' || r.status !== 'playing') return;
        let p = r.players[socket.id];
        let fireRate = ((r.mode === 'savas' || r.mode === 'bayrak') && !p.isAdmin) ? 1000 : 150;
        if(p && p.hp > 0 && Date.now() - p.lastFire > fireRate) {
            if(r.mode === 'bayrak') {
                ['up','down','left','right'].forEach(d => {
                    r.bullets.push({ x: p.x + 10, y: p.y + 10, dir: d, owner: socket.id, team: p.team });
                });
            } else {
                r.bullets.push({ x: p.x + 10, y: p.y + 10, dir: p.lastDir, owner: socket.id, team: p.team });
            }
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
            if(rooms[socket.roomName].flag.carrier === socket.id) rooms[socket.roomName].flag.carrier = null;
            delete rooms[socket.roomName].players[socket.id];
            if (Object.keys(rooms[socket.roomName].players).length === 0) delete rooms[socket.roomName];
            io.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length, status:rooms[k].status})));
        }
    });
});

setInterval(() => {
    for(let name in rooms) {
        let r = rooms[name]; if(r.status !== 'playing') continue;
        if(r.mode === 'bayrak' && r.flag.carrier) {
            r.players[r.flag.carrier].score += 1;
            if(r.players[r.flag.carrier].score >= 500) io.to(name).emit('winner', r.players[r.flag.carrier].name + " KAZANDI!");
        }
        if(r.mode === 'zombi') {
            let maxZ = 3 + (r.wave * 2);
            if(r.zombies.length < maxZ && r.spawned < maxZ) {
                let side = Math.floor(Math.random() * 4);
                let pos = (side===0) ? {x:Math.random()*400, y:-40} : (side===1) ? {x:Math.random()*400, y:440} : (side===2) ? {x:-40, y:Math.random()*400} : {x:440, y:Math.random()*400};
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
                    z.x += (z.x < target.x) ? 1.5 : -1.5; z.y += (z.y < target.y) ? 1.5 : -1.5;
                    if(minDist < 20 && Math.random() > 0.95 && !target.isAdmin) target.hp -= 1;
                }
            });
        }
        r.bullets.forEach((b, bi) => {
            if (b.dir === 'up') b.y -= 15; else if (b.dir === 'down') b.y += 15; else if (b.dir === 'left') b.x -= 15; else b.x += 15;
            r.zombies.forEach((z, zi) => {
                if(b.x < z.x+25 && b.x+8 > z.x && b.y < z.y+25 && b.y+8 > z.y) {
                    z.hp -= 1; r.bullets.splice(bi, 1); if(z.hp <= 0) r.zombies.splice(zi, 1);
                }
            });
            for(let id in r.players) {
                let p = r.players[id];
                if(id !== b.owner && p.hp > 0 && !p.isAdmin && b.x < p.x+25 && b.x+8 > p.x && b.y < p.y+25 && b.y+8 > p.y) {
                    if(r.mode === 'savas' || (r.mode === 'bayrak' && p.team !== b.team)) {
                        p.hp -= 1; r.bullets.splice(bi, 1); 
                        if(p.hp <= 0 && r.flag.carrier === id) r.flag.carrier = null;
                        break;
                    }
                }
            }
        });
        io.to(name).emit('state', { players: r.players, flag: r.flag, walls: (r.mode === 'labirent' ? mazeWalls : (r.mode === 'bayrak' ? baseWalls : [])), bullets: r.bullets, zombies: r.zombies, mode: r.mode, wave: r.wave });
    }
}, 50);

http.listen(process.env.PORT || 3000, '0.0.0.0');