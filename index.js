const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

let rooms = {};
const WALLS = [{x: 60, y: 100, w: 20, h: 200}, {x: 320, y: 100, w: 20, h: 200}];

io.on('connection', (socket) => {
    const sendLobby = () => {
        io.emit('roomList', Object.keys(rooms).map(name => ({
            name, count: Object.keys(rooms[name].players).length, 
            mode: rooms[name].mode, started: rooms[name].started
        })));
    };
    sendLobby();

    socket.on('createRoom', (data) => {
        const rName = data.roomName;
        if (!rooms[rName]) {
            rooms[rName] = { 
                players: {}, bullets: [], zombies: [], mode: data.mode, wave: 1,
                flags: { red: {x: 30, y: 190, taken: false}, blue: {x: 350, y: 190, taken: false} },
                scores: { red: 0, blue: 0 }, started: false, host: socket.id
            };
        }
        let r = rooms[rName];
        let team = (r.mode === 'bayrak' || r.mode === 'vs') ? (Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue') : 'solo';
        
        socket.join(rName);
        socket.roomName = rName;
        // HAFIZA: 1 HP kuralı uygulandı
        r.players[socket.id] = { 
            id: socket.id, x: (team==='red'?40:340), y: 190, hp: 1, 
            name: data.userName || "Osman", color: (team === 'red' ? 'red' : 'blue'), 
            team: team, hasFlag: false, lastFire: 0, lastDir: 'up', lastSpecial: 0
        };
        socket.emit('joined', { mode: r.mode, room: rName, isHost: (r.host === socket.id) });
        sendLobby();
    });

    socket.on('startGame', () => {
        let r = rooms[socket.roomName];
        if(r && r.host === socket.id) { r.started = true; io.to(socket.roomName).emit('gameStarted'); sendLobby(); }
    });

    // HAFIZA: 'B' Tuşu Özel Gücü (Zombi modunda etraftakileri yok eder)
    socket.on('specialPower', () => {
        let r = rooms[socket.roomName]; let p = r?.players[socket.id];
        if(p && p.hp > 0 && r.started && Date.now() - p.lastSpecial > 15000) {
            p.lastSpecial = Date.now();
            if(r.mode === 'zombi') {
                // 80 birim yakındaki tüm zombileri temizler
                r.zombies = r.zombies.filter(z => Math.hypot(z.x - p.x, z.y - p.y) > 80);
            }
            io.to(socket.roomName).emit('specialEffect', { x: p.x + 12, y: p.y + 12 });
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; let p = r?.players[socket.id];
        if (p && p.hp > 0 && r.started) {
            p.lastDir = dir;
            let speed = p.hasFlag ? 8 : 15;
            let nx = p.x, ny = p.y;
            if(dir==='up') ny -= speed; if(dir==='down') ny += speed;
            if(dir==='left') nx -= speed; if(dir==='right') nx += speed;
            let hitWall = false;
            if(r.mode === 'bayrak') WALLS.forEach(w => { if(nx<w.x+w.w && nx+20>w.x && ny<w.y+w.h && ny+20>w.y) hitWall = true; });
            if(!hitWall) { p.x = Math.max(0, Math.min(380, nx)); p.y = Math.max(0, Math.min(380, ny)); }
        }
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; let p = r?.players[socket.id];
        // HAFIZA: 1 saniye cooldown ve Bayrak modunda 4-yön ateş
        if(p && p.hp > 0 && r.started && Date.now() - p.lastFire > 1000) {
            p.lastFire = Date.now();
            let bDirs = r.mode === 'bayrak' ? [[0,-8],[0,8],[-8,0],[8,0]] : [{up:[0,-8],down:[0,8],left:[-8,0],right:[8,0]}[p.lastDir]];
            if(bDirs[0]) bDirs.forEach(v => r.bullets.push({x: p.x+10, y: p.y+10, dx: v[0], dy: v[1], owner: socket.id}));
        }
    });

    setInterval(() => {
        for (let n in rooms) {
            let r = rooms[n];
            if(!r.started) { io.to(n).emit('state', r); continue; }

            r.bullets.forEach((b, bi) => {
                b.x += b.dx; b.y += b.dy;
                if(r.mode === 'zombi') {
                    r.zombies.forEach((z, zi) => {
                        if(Math.hypot(b.x - z.x, b.y - z.y) < 25) { r.zombies.splice(zi, 1); r.bullets.splice(bi, 1); }
                    });
                }
                // VS modunda mermi oyuncuya değerse
                if(r.mode === 'vs' || r.mode === 'bayrak') {
                    Object.values(r.players).forEach(p => {
                        if(p.id !== b.owner && Math.hypot(b.x - p.x, b.y - p.y) < 20) { p.hp = 0; r.bullets.splice(bi, 1); }
                    });
                }
                if(b.x<0 || b.x>400 || b.y<0 || b.y>400) r.bullets.splice(bi, 1);
            });

            if(r.mode === 'zombi') {
                if(r.zombies.length === 0) {
                    for(let i=0; i<r.wave*3; i++) r.zombies.push({x: Math.random()*400, y: 0});
                    r.wave++;
                }
                r.zombies.forEach(z => {
                    let targets = Object.values(r.players).filter(pl => pl.hp > 0);
                    if(targets.length > 0) {
                        let t = targets[0];
                        // HAFIZA: Zombi hızı 0.5
                        z.x += (z.x < t.x ? 0.5 : -0.5); z.y += (z.y < t.y ? 0.5 : -0.5);
                        if(Math.hypot(z.x-t.x, z.y-t.y) < 20) t.hp = 0; // Tek vuruşta ölür (1 HP)
                    }
                });
            }

            if(r.mode === 'bayrak') {
                Object.values(r.players).forEach(p => {
                    let enemy = p.team === 'red' ? 'blue' : 'red';
                    if(!p.hasFlag && !r.flags[enemy].taken && Math.hypot(p.x-r.flags[enemy].x, p.y-r.flags[enemy].y)<25) {
                        p.hasFlag = true; r.flags[enemy].taken = true;
                    }
                    let base = p.team === 'red' ? {x:30, y:190} : {x:350, y:190};
                    if(p.hasFlag && Math.hypot(p.x-base.x, p.y-base.y)<30) {
                        p.hasFlag = false; r.flags[enemy].taken = false; r.scores[p.team]++;
                        if(r.scores[p.team] >= 3) { io.to(n).emit('gameOver', { msg: p.team.toUpperCase() + " KAZANDI!" }); delete rooms[n]; }
                    }
                });
            }

            Object.values(r.players).forEach(p => {
                if(p.hp <= 0) {
                    if(r.mode === 'zombi') { io.to(n).emit('gameOver', { msg: "Zombiler kazandı!" }); delete rooms[n]; }
                    else { p.hp = 1; p.x = (p.team==='red'?40:340); p.y = 190; p.hasFlag=false; }
                }
            });
            io.to(n).emit('state', r);
        }
    }, 50);

    socket.on('disconnect', () => {
        if(socket.roomName && rooms[socket.roomName]) {
            delete rooms[socket.roomName].players[socket.id];
            if(Object.keys(rooms[socket.roomName].players).length === 0) delete rooms[socket.roomName];
            sendLobby();
        }
    });
});
http.listen(process.env.PORT || 3000);
