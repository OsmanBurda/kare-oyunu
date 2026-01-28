const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], 
            mode: data.mode || 'zombi', wave: 1,
            flags: { red: {x: 30, y: 190}, blue: {x: 350, y: 190} }
        };
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName);
        socket.roomName = rName;
        let r = rooms[rName];
        let team = (r.mode === 'bayrak' || r.mode === 'vs') ? (Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue') : 'solo';
        r.players[socket.id] = { 
            id: socket.id, x: (team==='red'?70:310), y: 190, hp: (r.mode === 'vs' ? 3 : 10), 
            name: uName || "Osman", color: (team === 'red' ? 'red' : 'blue'), 
            lastFire: 0, lastDir: 'up', team: team
        };
        socket.emit('joined', { mode: r.mode });
    }

    socket.on('fire', () => {
        let r = rooms[socket.roomName];
        let p = r?.players[socket.id];
        if (p && Date.now() - p.lastFire > 1000) { 
            p.lastFire = Date.now();
            if (r.mode === 'bayrak') {
                // SADECE BAYRAK MODUNDA 4 YÖN
                [[0,-7], [0,7], [-7,0], [7,0]].forEach(v => {
                    r.bullets.push({ x: p.x+8, y: p.y+8, dx: v[0], dy: v[1], owner: socket.id });
                });
            } else {
                // DİĞER MODLARDA TEK YÖN
                const v = { up: [0,-7], down: [0,7], left: [-7,0], right: [7,0] }[p.lastDir];
                r.bullets.push({ x: p.x+8, y: p.y+8, dx: v[0], dy: v[1], owner: socket.id });
            }
        }
    });

    socket.on('move', (dir) => {
        let p = rooms[socket.roomName]?.players[socket.id];
        if (p) { 
            p.lastDir = dir;
            if(dir==='up') p.y-=20; if(dir==='down') p.y+=20; 
            if(dir==='left') p.x-=20; if(dir==='right') p.x+=20;
            p.x = Math.max(0, Math.min(375, p.x)); p.y = Math.max(0, Math.min(375, p.y));
        }
    });

    setInterval(() => {
        for (let n in rooms) {
            let r = rooms[n];
            r.bullets.forEach((b, bi) => { 
                b.x += b.dx; b.y += b.dy; 
                if (r.mode === 'zombi') {
                    r.zombies.forEach((z, zi) => {
                        if (Math.hypot(b.x - z.x, b.y - z.y) < 25) { r.zombies.splice(zi, 1); r.bullets.splice(bi, 1); }
                    });
                }
                if(b.x<0 || b.x>400 || b.y<0 || b.y>400) r.bullets.splice(bi,1); 
            });

            if (r.mode === 'zombi') {
                r.zombies.forEach(z => {
                    let t = Object.values(r.players)[0];
                    if(t) { z.x+=(z.x<t.x?0.5:-0.5); z.y+=(z.y<t.y?0.5:-0.5); if(Math.hypot(z.x-t.x,z.y-t.y)<20) t.hp-=0.05; }
                });
                if(r.zombies.length < r.wave+5) {
                    let side = Math.floor(Math.random()*4);
                    let zx = side===2?0:(side===3?400:Math.random()*400);
                    let zy = side===0?0:(side===1?400:Math.random()*400);
                    r.zombies.push({x: zx, y: zy});
                }
            }
            io.to(n).emit('state', r);
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);
