const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = data.roomName || "OsmanOda";
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], mode: data.mode, 
            wave: 1,
            // Bayrak Konumları: Kırmızı üssü (sol üst), Mavi üssü (sağ alt)
            flags: { red: {x: 30, y: 30}, blue: {x: 345, y: 345} },
            scores: { red: 0, blue: 0 }, winner: null
        };
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName);
        socket.roomName = rName;
        let r = rooms[rName];
        let hpVal = (r.mode === 'zombi' ? 10 : (r.mode === 'savas' ? 3 : 1));
        let team = Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue';
        r.players[socket.id] = { 
            x: team === 'red' ? 50 : 330, y: team === 'red' ? 50 : 330, 
            name: uName || "Osman", team: team, hp: hpVal, maxHp: hpVal,
            lastFire: 0, lastBlast: 0, lastDir: 'up', hasFlag: false 
        };
        socket.emit('joined');
    }

    socket.on('specialPower', () => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id];
        if(r.mode === 'zombi' && p && p.hp > 0 && Date.now() - p.lastBlast > 3000) { 
            r.zombies = r.zombies.filter(z => Math.hypot(z.x - p.x, z.y - p.y) > 80);
            io.to(socket.roomName).emit('blastEffect', {x: p.x+12, y: p.y+12, range: 80});
            p.lastBlast = Date.now();
        }
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r) return;
        let p = r.players[socket.id];
        let cd = (r.mode === 'savas' ? 1000 : 250); 
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

        // BAYRAK KAPMA MANTIĞI
        if(r.mode === 'bayrak') {
            let enemyTeam = p.team === 'red' ? 'blue' : 'red';
            // Rakip bayrağı alma
            if(!p.hasFlag && Math.hypot(p.x - r.flags[enemyTeam].x, p.y - r.flags[enemyTeam].y) < 30) {
                p.hasFlag = true;
            }
            // Kendi üssüne getirme
            if(p.hasFlag && Math.hypot(p.x - r.flags[p.team].x, p.y - r.flags[p.team].y) < 30) {
                r.scores[p.team]++;
                p.hasFlag = false;
                if(r.scores[p.team] >= 3) r.winner = p.team;
            }
        }
    });
});

setInterval(() => {
    for(let n in rooms) {
        let r = rooms[n];
        // Zombi ve mermi hareketleri... (Aynı kalıyor)
        r.bullets.forEach((b, bi) => {
            if(b.dir==='up') b.y-=15; else if(b.dir==='down') b.y+=15; else if(b.dir==='left') b.x-=15; else if(b.dir==='right') b.x+=15;
            for(let id in r.players) {
                let t = r.players[id];
                if(id !== b.owner && t.hp > 0 && b.x < t.x+25 && b.x+8 > t.x && b.y < t.y+25 && b.y+8 > t.y) {
                    t.hp -= 1; r.bullets.splice(bi, 1);
                    if(t.hasFlag) t.hasFlag = false; // Ölen bayrağı düşürür
                }
            }
            if(b.x<0 || b.x>400 || b.y<0 || b.y>400) r.bullets.splice(bi, 1);
        });
        io.to(n).emit('state', r);
    }
}, 50);

http.listen(process.env.PORT || 3000);
