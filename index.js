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
            status: 'playing', // Hemen başlasın diye düzelttim
            flags: { red: {x: 20, y: 20}, blue: {x: 360, y: 360} },
            scores: { red: 0, blue: 0 }
        };
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName); socket.roomName = rName;
        let r = rooms[rName];
        let hpVal = (r.mode === 'zombi' ? 10 : (r.mode === 'savas' ? 3 : 1));
        let team = Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue';
        r.players[socket.id] = { 
            x: team === 'red' ? 50 : 330, y: team === 'red' ? 50 : 330, 
            name: uName || "Osman", color: team, team: team,
            hp: hpVal, lastFire: 0, lastBlast: 0, lastDir: 'up', hasFlag: false 
        };
        socket.emit('joined');
    }

    socket.on('specialPower', () => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id];
        if(p && p.hp > 0 && Date.now() - p.lastBlast > 3000) { 
            if(r.mode === 'zombi') r.zombies = r.zombies.filter(z => Math.hypot(z.x - p.x, z.y - p.y) > 120);
            p.lastBlast = Date.now();
        }
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r || r.mode === 'bayrak') return;
        let p = r.players[socket.id];
        let cd = (r.mode === 'savas' ? 1000 : 250);
        if(p && p.hp > 0 && Date.now() - p.lastFire > cd) {
            r.bullets.push({x: p.x+8, y: p.y+8, dir: p.lastDir, owner: socket.id});
            p.lastFire = Date.now();
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r) return;
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
                if(r.scores[p.team] >= 3) { r.scores = {red:0, blue:0}; } // Maç sıfırlansın
            }
        }
    });
});

setInterval(() => {
    for(let n in rooms) {
        let r = rooms[n];
        if(r.mode === 'zombi') {
            if(r.zombies.length < 5) r.zombies.push({x: Math.random()*375, y: 0, hp: 2});
            r.zombies.forEach((z, zi) => {
                let targets = Object.values(r.players).filter(p => p.hp > 0);
                if(targets[0]) {
                    z.x += (z.x < targets[0].x ? 0.8 : -0.8); z.y += (z.y < targets[0].y ? 0.8 : -0.8);
                    if(Math.hypot(z.x-targets[0].x, z.y-targets[0].y) < 20) targets[0].hp -= 0.05;
                }
                r.bullets.forEach((b, bi) => {
                    if(b.x < z.x+25 && b.x+8 > z.x && b.y < z.y+25 && b.y+8 > z.y) {
                        z.hp -= 1; r.bullets.splice(bi, 1);
                        if(z.hp <= 0) r.zombies.splice(zi, 1);
                    }
                });
            });
        }
        r.bullets.forEach((b, i) => {
            if(b.dir==='up') b.y-=15; else if(b.dir==='down') b.y+=15; else if(b.dir==='left') b.x-=15; else if(b.dir==='right') b.x+=15;
            if(b.x<0 || b.x>400 || b.y<0 || b.y>400) r.bullets.splice(i, 1);
        });
        io.to(n).emit('state', r);
    }
}, 50);

http.listen(process.env.PORT || 3000);
