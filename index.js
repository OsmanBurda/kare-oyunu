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
        r.players[socket.id] = { 
            id: socket.id, x: (team==='red'?40:340), y: 190, hp: (r.mode === 'vs' ? 3 : 10), 
            name: data.userName || "Osman", color: (team === 'red' ? 'red' : 'blue'), 
            team: team, hasFlag: false, lastFire: 0, lastDir: 'up'
        };
        
        socket.emit('joined', { mode: r.mode, room: rName, isHost: (r.host === socket.id) });
        sendLobby();
    });

    socket.on('startGame', () => {
        let r = rooms[socket.roomName];
        if(r && r.host === socket.id) {
            r.started = true;
            io.to(socket.roomName).emit('gameStarted');
            sendLobby();
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
        if(p && p.hp > 0 && r.started && Date.now() - p.lastFire > 1000) {
            p.lastFire = Date.now();
            let bulletDirs = r.mode === 'bayrak' ? [[0,-8],[0,8],[-8,0],[8,0]] : [{up:[0,-8], down:[0,8], left:[-8,0], right:[8,0]}[p.lastDir]];
            if(Array.isArray(bulletDirs)) {
                bulletDirs.forEach(v => r.bullets.push({x: p.x+10, y: p.y+10, dx: v[0], dy: v[1], owner: socket.id}));
            }
        }
    });

    setInterval(() => {
        for (let n in rooms) {
            let r = rooms[n];
            if(!r.started) continue;

            r.bullets.forEach((b, bi) => {
                b.x += b.dx; b.y += b.dy;
                // Zombi Ölme Kontrolü
                if(r.mode === 'zombi') {
                    r.zombies.forEach((z, zi) => {
                        if(Math.hypot(b.x - z.x, b.y - z.y) < 25) {
                            r.zombies.splice(zi, 1); r.bullets.splice(bi, 1);
                        }
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
                        z.x += (z.x < t.x ? 0.5 : -0.5); z.y += (z.y < t.y ? 0.5 : -0.5);
                        if(Math.hypot(z.x-t.x, z.y-t.y) < 20) t.hp -= 0.1;
                    }
                });
            }

            if(r.mode === 'bayrak') {
                Object.values(r.players).forEach(p => {
                    let enemyTeam = p.team === 'red' ? 'blue' : 'red';
                    if(!p.hasFlag && !r.flags[enemyTeam].taken && Math.hypot(p.x-r.flags[enemyTeam].x, p.y-r.flags[enemyTeam].y)<25) {
                        p.hasFlag = true; r.flags[enemyTeam].taken = true;
                    }
                    let base = p.team === 'red' ? {x:30, y:190} : {x:350, y:190};
                    if(p.hasFlag && Math.hypot(p.x-base.x, p.y-base.y)<30) {
                        p.hasFlag = false; r.flags[enemyTeam].taken = false; r.scores[p.team]++;
                        if(r.scores[p.team] >= 3) {
                            io.to(n).emit('gameOver', { msg: p.team.toUpperCase() + " KAZANDI!" });
                            delete rooms[n]; sendLobby();
                        }
                    }
                });
            }

            // Ölüm Kontrolü
            Object.values(r.players).forEach(p => {
                if(p.hp <= 0) {
                    if(r.mode === 'zombi') {
                        io.to(n).emit('gameOver', { msg: "Zombiler kazandı! Oda kapandı." });
                        delete rooms[n]; sendLobby();
                    } else {
                        p.hp = (r.mode === 'vs' ? 3 : 10);
                        p.x = (p.team==='red'?40:340); p.y = 190;
                    }
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
