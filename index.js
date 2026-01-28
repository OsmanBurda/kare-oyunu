const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = "OsmanOda"; 
        if (!rooms[rName]) {
            rooms[rName] = { 
                players: {}, bullets: [], zombies: [], mode: data.mode || 'zombi', 
                wave: 1, scores: { red: 0, blue: 0 }, winner: null,
                flags: { red: {x: 40, y: 40}, blue: {x: 340, y: 340} }
            };
        }
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName);
        socket.roomName = rName;
        let r = rooms[rName];
        let team = Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue';
        // Kalıcı HP Ayarları: Zombi 10, Savaş 3 (3 can), Bayrak 1
        let hpVal = r.mode === 'zombi' ? 10 : (r.mode === 'savas' ? 3 : 1);
        
        r.players[socket.id] = { 
            x: team === 'red' ? 50 : 330, y: team === 'red' ? 50 : 330, 
            name: uName || "Osman", team: team, hp: hpVal, maxHp: hpVal,
            lastFire: 0, lastBlast: 0, lastDir: 'up', hasFlag: false 
        };
    }

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r || r.winner) return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        const s = 15;
        if (dir === 'up' && p.y > 5) p.y -= s;
        if (dir === 'down' && p.y < 370) p.y += s;
        if (dir === 'left' && p.x > 5) p.x -= s;
        if (dir === 'right' && p.x < 370) p.x += s;
        p.lastDir = dir;

        if(r.mode === 'bayrak') {
            let enemyTeam = p.team === 'red' ? 'blue' : 'red';
            if(!p.hasFlag && Math.hypot(p.x - r.flags[enemyTeam].x, p.y - r.flags[enemyTeam].y) < 30) p.hasFlag = true;
            if(p.hasFlag && Math.hypot(p.x - r.flags[p.team].x, p.y - r.flags[p.team].y) < 30) {
                r.scores[p.team]++; p.hasFlag = false;
                if(r.scores[p.team] >= 3) r.winner = p.team;
            }
        }
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id];
        let cd = (r.mode === 'savas' ? 1000 : 250); // Savaş modunda 1 saniye cooldown
        if(p && p.hp > 0 && Date.now() - p.lastFire > cd) {
            if(r.mode === 'bayrak') {
                ['up','down','left','right'].forEach(d => r.bullets.push({x: p.x+8, y: p.y+8, dir: d, owner: socket.id}));
            } else {
                r.bullets.push({x: p.x+8, y: p.y+8, dir: p.lastDir, owner: socket.id});
            }
            p.lastFire = Date.now();
        }
    });

    socket.on('specialPower', () => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id];
        if(r.mode === 'zombi' && p && p.hp > 0 && Date.now() - p.lastBlast > 3000) { 
            r.zombies = r.zombies.filter(z => Math.hypot(z.x - (p.x+12), z.y - (p.y+12)) > 80);
            io.to(socket.roomName).emit('blastEffect', {x: p.x+12, y: p.y+12, range: 80});
            p.lastBlast = Date.now();
        }
    });
});

setInterval(() => {
    for(let n in rooms) {
        let r = rooms[n];
        if(r.mode === 'zombi' && r.zombies.length < 8) r.zombies.push({x: Math.random()*370, y: 0});
        
        r.zombies.forEach(z => {
            let targets = Object.values(r.players).filter(p => p.hp > 0);
            if(targets[0]) {
                z.x += (z.x < targets[0].x ? 2 : -2); z.y += (z.y < targets[0].y ? 2 : -2);
                if(Math.hypot(z.x-targets[0].x, z.y-targets[0].y) < 20) targets[0].hp -= 0.1;
            }
        });

        r.bullets.forEach((b, bi) => {
            if(b.dir==='up') b.y-=15; else if(b.dir==='down') b.y+=15; else if(b.dir==='left') b.x-=15; else if(b.dir==='right') b.x+=15;
            for(let id in r.players) {
                let t = r.players[id];
                if(id !== b.owner && t.hp > 0 && b.x < t.x+25 && b.x+8 > t.x && b.y < t.y+25 && b.y+8 > t.y) {
                    t.hp -= 1; r.bullets.splice(bi, 1);
                    if(t.hasFlag) t.hasFlag = false;
                }
            }
            if(b.x<0 || b.x>400 || b.y<0 || b.y>400) r.bullets.splice(bi, 1);
        });
        io.to(n).emit('state', r);
    }
}, 50);

http.listen(process.env.PORT || 3000);
