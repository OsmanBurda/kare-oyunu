const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

let rooms = {}; 
const mazeWalls = [{ x: 0, y: 300, w: 340, h: 10 }, { x: 60, y: 220, w: 340, h: 10 }, { x: 0, y: 140, w: 340, h: 10 }, { x: 60, y: 60, w: 340, h: 10 }];
const baseWalls = [{x: 0, y: 80, w: 100, h: 10}, {x: 300, y: 310, w: 100, h: 10}];

io.on('connection', (socket) => {
    socket.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));

    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda";
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], mode: data.mode, wave: 1, spawned: 0, status: 'lobby', leader: socket.id,
            redFlag: {x: 30, y: 30, carrier: null}, blueFlag: {x: 345, y: 345, carrier: null},
            scores: { Kırmızı: 0, Mavi: 0 }
        };
        joinProcess(socket, rName, data.userName, data.team);
    });

    socket.on('joinExistingRoom', (data) => {
        if (!rooms[data.roomName]) return;
        joinProcess(socket, data.roomName, data.userName, data.team);
    });

    function joinProcess(socket, rName, uName, team) {
        socket.join(rName); socket.roomName = rName;
        let mode = rooms[rName].mode;
        let initialHp = (mode === 'zombi' ? 10 : (mode === 'bayrak' ? 1 : 3));
        let pColor = (mode === 'bayrak') ? (team === 'Kırmızı' ? '#ff4444' : '#4444ff') : '#' + Math.floor(Math.random()*16777215).toString(16);
        
        rooms[rName].players[socket.id] = { 
            x: 185, y: 185, name: uName || "Kare", color: pColor, team: (mode === 'bayrak' ? team : null), 
            hp: initialHp, active: false, lastDir: 'up', lastFire: 0, lastBlast: 0 
        };
        socket.emit('joined', { isLeader: (rooms[rName].leader === socket.id) });
    }

    socket.on('startGameSignal', () => {
        let r = rooms[socket.roomName];
        if(r && r.leader === socket.id) {
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

    socket.on('areaBlast', () => {
        let r = rooms[socket.roomName]; if(!r || r.mode !== 'zombi') return;
        let p = r.players[socket.id];
        if(p && p.hp > 0 && Date.now() - p.lastBlast > 15000) {
            p.lastBlast = Date.now();
            r.zombies = r.zombies.filter(z => Math.hypot(p.x - z.x, p.y - z.y) > 80);
            io.to(socket.roomName).emit('blastEffect', { x: p.x + 12, y: p.y + 12 });
        }
    });

    setInterval(() => {
        for(let name in rooms) {
            let r = rooms[name]; if(r.status !== 'playing') continue;
            if(r.redFlag.carrier) { let c = r.players[r.redFlag.carrier]; r.redFlag.x = c.x; r.redFlag.y = c.y; }
            if(r.blueFlag.carrier) { let c = r.players[r.blueFlag.carrier]; r.blueFlag.x = c.x; r.blueFlag.y = c.y; }
            
            if(r.mode === 'zombi') {
                if(r.zombies.length < 5) r.zombies.push({x: Math.random()*380, y: Math.random()*380, hp: 1});
                r.zombies.forEach(z => {
                    let targets = Object.values(r.players).filter(p => p.hp > 0);
                    if(targets.length > 0) {
                        z.x += z.x < targets[0].x ? 1 : -1; z.y += z.y < targets[0].y ? 1 : -1;
                    }
                });
            }

            r.bullets.forEach((b, bi) => {
                b.x += (b.dir==='left'?-15:(b.dir==='right'?15:0)); b.y += (b.dir==='up'?-15:(b.dir==='down'?15:0));
                for(let id in r.players) {
                    let p = r.players[id];
                    if(id !== b.owner && p.hp > 0 && b.x < p.x+25 && b.x+8 > p.x && b.y < p.y+25 && b.y+8 > p.y) {
                        if(r.mode === 'savas' || (r.mode === 'bayrak' && p.team !== b.team)) {
                            p.hp -= 1; r.bullets.splice(bi, 1);
                            if(p.hp <= 0) { 
                                if(r.redFlag.carrier === id) { r.redFlag.carrier = null; r.redFlag.x = 30; r.redFlag.y = 30; } 
                                if(r.blueFlag.carrier === id) { r.blueFlag.carrier = null; r.blueFlag.x = 345; r.blueFlag.y = 345; } 
                            }
                            break;
                        }
                    }
                }
            });
            io.to(name).emit('state', { players: r.players, redFlag: r.redFlag, blueFlag: r.blueFlag, scores: r.scores, mode: r.mode, bullets: r.bullets, zombies: r.zombies, walls: (r.mode==='labirent'?mazeWalls:(r.mode==='bayrak'?baseWalls:[])) });
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);