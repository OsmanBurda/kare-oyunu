const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

let rooms = {}; 
const mazeWalls = [{ x: 0, y: 300, w: 340, h: 10 }, { x: 60, y: 220, w: 340, h: 10 }, { x: 0, y: 140, w: 340, h: 10 }, { x: 60, y: 60, w: 340, h: 10 }];
const baseWalls = [{x: 0, y: 80, w: 100, h: 10}, {x: 300, y: 310, w: 100, h: 10}];

io.on('connection', (socket) => {
    // Oda listesini her yeni bağlantıda gönder
    socket.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));

    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        if (rooms[rName]) return socket.emit('err', 'Oda zaten var!');
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], mode: data.mode, status: 'lobby', 
            leader: socket.id, redFlag: {x: 30, y: 30, carrier: null}, blueFlag: {x: 345, y: 345, carrier: null},
            scores: { Kırmızı: 0, Mavi: 0 }
        };
        joinProcess(socket, rName, data.userName, data.team);
    });

    socket.on('joinExistingRoom', (data) => {
        if (!rooms[data.roomName] || rooms[data.roomName].status === 'playing') return socket.emit('err', 'Giriş kapalı!');
        joinProcess(socket, data.roomName, data.userName, data.team);
    });

    function joinProcess(socket, rName, uName, team) {
        socket.join(rName); socket.roomName = rName;
        let r = rooms[rName];
        let initialHp = (r.mode === 'zombi' ? 10 : (r.mode === 'bayrak' ? 1 : 3));
        let pColor = (r.mode === 'bayrak') ? (team === 'Kırmızı' ? '#ff4444' : '#4444ff') : '#' + Math.floor(Math.random()*16777215).toString(16);
        
        r.players[socket.id] = { 
            x: 185, y: 185, name: uName || "Kare", color: pColor, team: (r.mode === 'bayrak' ? team : null), 
            hp: initialHp, active: false, lastDir: 'up', lastFire: 0, lastBlast: 0 
        };
        
        socket.emit('joined', { isLeader: (r.leader === socket.id) });
        io.to(rName).emit('updatePlayerList', Object.values(r.players).map(p => ({name: p.name, team: p.team})));
        io.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));
    }

    socket.on('startGameSignal', () => {
        let r = rooms[socket.roomName];
        if(r && r.leader === socket.id && r.status === 'lobby') {
            r.status = 'playing';
            for(let id in r.players) { 
                let p = r.players[id]; p.active = true; 
                if(r.mode === 'bayrak') { p.x = p.team === 'Kırmızı' ? 20 : 350; p.y = p.team === 'Kırmızı' ? 20 : 350; }
                else { p.x = 20 + Math.random() * 350; p.y = 20 + Math.random() * 350; }
            }
            io.to(socket.roomName).emit('gameStarted');
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        let speed = (r.redFlag.carrier === socket.id || r.blueFlag.carrier === socket.id) ? 10 : 20;
        let nX = p.x, nY = p.y;
        if (dir === 'up') nY -= speed; if (dir === 'down') nY += speed;
        if (dir === 'left') nX -= speed; if (dir === 'right') nX += speed;
        let walls = (r.mode === 'labirent') ? mazeWalls : (r.mode === 'bayrak' ? baseWalls : []);
        let hit = walls.some(w => nX < w.x + w.w && nX + 25 > w.x && nY < w.y + w.h && nY + 25 > w.y);
        if (!hit && nX >= 5 && nX <= 370 && nY >= 0 && nY <= 375) { p.x = nX; p.y = nY; p.lastDir = dir; }
        
        if(r.mode === 'bayrak') {
            if(p.team === 'Mavi' && !r.redFlag.carrier && Math.hypot(p.x - r.redFlag.x, p.y - r.redFlag.y) < 30) r.redFlag.carrier = socket.id;
            if(p.team === 'Kırmızı' && !r.blueFlag.carrier && Math.hypot(p.x - r.blueFlag.x, p.y - r.blueFlag.y) < 30) r.blueFlag.carrier = socket.id;
            if(p.team === 'Mavi' && r.redFlag.carrier === socket.id && Math.hypot(p.x - 345, p.y - 345) < 30) {
                r.scores.Mavi++; r.redFlag.carrier = null; r.redFlag.x = 30; r.redFlag.y = 30;
                if(r.scores.Mavi >= 3) io.to(socket.roomName).emit('winner', "MAVİ TAKIM KAZANDI!");
            }
            if(p.team === 'Kırmızı' && r.blueFlag.carrier === socket.id && Math.hypot(p.x - 20, p.y - 20) < 30) {
                r.scores.Kırmızı++; r.blueFlag.carrier = null; r.blueFlag.x = 345; r.blueFlag.y = 345;
                if(r.scores.Kırmızı >= 3) io.to(socket.roomName).emit('winner', "KIRMIZI TAKIM KAZANDI!");
            }
        }
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id];
        let fireRate = (r.mode === 'savas' || r.mode === 'bayrak') ? 1000 : 150;
        if(p && p.hp > 0 && Date.now() - p.lastFire > fireRate) {
            if(r.mode === 'bayrak') {
                ['up','down','left','right'].forEach(d => { r.bullets.push({ x: p.x + 10, y: p.y + 10, dir: d, owner: socket.id, team: p.team }); });
            } else { r.bullets.push({ x: p.x + 10, y: p.y + 10, dir: p.lastDir, owner: socket.id, team: p.team }); }
            p.lastFire = Date.now();
        }
    });

    socket.on('disconnect', () => {
        if(socket.roomName && rooms[socket.roomName]) {
            let r = rooms[socket.roomName];
            delete r.players[socket.id];
            if (Object.keys(r.players).length === 0) { delete rooms[socket.roomName]; }
            else {
                if(r.leader === socket.id) r.leader = Object.keys(r.players)[0];
                io.to(socket.roomName).emit('updatePlayerList', Object.values(r.players).map(p => ({name: p.name, team: p.team})));
            }
            io.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));
        }
    });

    setInterval(() => {
        for(let name in rooms) {
            let r = rooms[name]; if(r.status !== 'playing') continue;
            if(r.redFlag.carrier) { let c = r.players[r.redFlag.carrier]; r.redFlag.x = c.x; r.redFlag.y = c.y; }
            if(r.blueFlag.carrier) { let c = r.players[r.blueFlag.carrier]; r.blueFlag.x = c.x; r.blueFlag.y = c.y; }
            r.bullets.forEach((b, bi) => {
                b.x += (b.dir==='left'?-15:(b.dir==='right'?15:0)); b.y += (b.dir==='up'?-15:(b.dir==='down'?15:0));
                for(let id in r.players) {
                    let p = r.players[id];
                    if(id !== b.owner && p.hp > 0 && b.x < p.x+25 && b.x+8 > p.x && b.y < p.y+25 && b.y+8 > p.y) {
                        if(r.mode === 'savas' || (r.mode === 'bayrak' && p.team !== b.team)) {
                            p.hp -= 1; r.bullets.splice(bi, 1);
                            if(p.hp <= 0) { if(r.redFlag.carrier === id) { r.redFlag.carrier = null; r.redFlag.x = 30; r.redFlag.y = 30; } if(r.blueFlag.carrier === id) { r.blueFlag.carrier = null; r.blueFlag.x = 345; r.blueFlag.y = 345; } }
                            break;
                        }
                    }
                }
            });
            io.to(name).emit('state', { players: r.players, redFlag: r.redFlag, blueFlag: r.blueFlag, scores: r.scores, mode: r.mode, bullets: r.bullets, walls: (r.mode==='labirent'?mazeWalls:(r.mode==='bayrak'?baseWalls:[])) });
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);