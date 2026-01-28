const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = data.roomName || "OsmanOda";
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], mode: data.mode, 
            status: 'playing', wave: 1, lastWaveTime: Date.now(),
            flags: { red: {x: 20, y: 20}, blue: {x: 360, y: 360} },
            scores: { red: 0, blue: 0 }, winner: null
        };
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName); socket.roomName = rName;
        let r = rooms[rName];
        // KALICI HP AYARLARI
        let hpVal = (r.mode === 'zombi' ? 10 : (r.mode === 'savas' ? 3 : 1));
        let team = Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue';
        r.players[socket.id] = { 
            x: team === 'red' ? 50 : 330, y: team === 'red' ? 50 : 330, 
            name: uName || "Osman", color: team, team: team,
            hp: hpVal, maxHp: hpVal, lastFire: 0, lastBlast: 0, lastDir: 'up', hasFlag: false 
        };
        socket.emit('joined');
    }

    socket.on('specialPower', () => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id];
        // KALICI KURAL: B gücü sadece zombi modunda çalışır
        if(r.mode === 'zombi' && p && p.hp > 0 && Date.now() - p.lastBlast > 3000) { 
            r.zombies = r.zombies.filter(z => Math.hypot(z.x - p.x, z.y - p.y) > 130);
            io.to(socket.roomName).emit('blastEffect', {x: p.x+12, y: p.y+12});
            p.lastBlast = Date.now();
        }
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id];
        let cd = (r.mode === 'savas' ? 1000 : 250); // SAVAŞ MODU 1 SN COOLDOWN
        if(p && p.hp > 0 && Date.now() - p.lastFire > cd) {
            if(r.mode === 'bayrak') {
                ['up','down','left','right'].forEach(d => r.bullets.push({x: p.x+8, y: p.y+8, dir: d, owner: socket.id}));
            } else {
                r.bullets.push({x: p.x+8, y: p.y+8, dir: p.lastDir, owner: socket.id});
            }
            p.lastFire = Date.now();
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r || r.winner) return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        let s = 20;
        if (dir === 'up' && p.y > 0) p.y -= s;
        if (dir === 'down' && p.y < 375) p.y += s;
        if (dir === 'left' && p.x > 0) p.x -= s;
        if (dir === 'right' && p.x < 375) p.x += s;
        p.lastDir = dir;

        if(r.mode === 'bayrak') {
            let enemyTeam = p.team === 'red' ? 'blue' : 'red';
            let ef = r.flags[enemyTeam];
            if(!p.hasFlag && Math.hypot(p.x - ef.x, p.y - ef.y) < 30) p.hasFlag = true;
            let mf = r.flags[p.team];
            if(p.hasFlag && Math.hypot(p.x - mf.x, p.y - mf.y) < 30) {
                r.scores[p.team]++; p.hasFlag = false;
                if(r.scores[p.team] >= 3) r.winner = p.team.toUpperCase();
            }
        }
    });
});

setInterval(() => {
    for(let n in rooms) {
        let r = rooms[n];
        if(r.mode === 'zombi' && !r.winner) {
            if(Date.now() - r.lastWaveTime > 20000) { r.wave++; r.lastWaveTime = Date.now(); }
            if(r.zombies.length < 5) r.zombies.push({x: Math.random()*375, y: 0, hp: 1});
            r.zombies.forEach((z) => {
                let targets = Object.values(r.players).filter(p => p.hp > 0);
                if(targets[0]) {
                    z.x += (z.x < targets[0].x ? 0.8 : -0.8); z.y += (z.y < targets[0].y ? 0.8 : -0.8);
                    if(Math.hypot(z.x-targets[0].x, z.y-targets[0].y) < 20) targets[0].hp -= 0.05;
                }
            });
        }
        r.bullets.forEach((b, bi) => {
            if(b.dir==='up') b.y-=15; else if(b.dir==='down') b.y+=15; else if(b.dir==='left') b.x-=15; else if(b.dir==='right') b.x+=15;
            if(r.mode === 'zombi') {
                r.zombies.forEach((z, zi) => {
                    if(b.x < z.x+25 && b.x+8 > z.x && b.y < z.y+25 && b.y+8 > z.y) {
                        r.zombies.splice(zi, 1); r.bullets.splice(bi, 1);
                    }
                });
            }
            for(let id in r.players) {
                let t = r.players[id];
                if(id !== b.owner && t.hp > 0 && b.x < t.x+25 && b.x+8 > t.x && b.y < t.y+25 && b.y+8 > t.y) {
                    t.hp -= 1; r.bullets.splice(bi, 1);
                }
            }
            if(b.x<0 || b.x>400 || b.y<0 || b.y>400) r.bullets.splice(bi, 1);
        });
        io.to(n).emit('state', r);
    }
}, 50);

http.listen(process.env.PORT || 3000);
