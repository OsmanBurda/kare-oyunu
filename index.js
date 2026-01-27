const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

let rooms = {}; 
const mazeWalls = [{ x: 0, y: 300, w: 300, h: 15 }, { x: 100, y: 200, w: 300, h: 15 }, { x: 0, y: 100, w: 300, h: 15 }];

io.on('connection', (socket) => {
    socket.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));

    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], 
            mode: data.mode, status: 'lobby', leader: socket.id,
            scores: { red: 0, blue: 0 } // Bayrak modu için puan
        };
        joinProcess(socket, rName, data.userName);
    });

    socket.on('joinExistingRoom', (data) => {
        if (!rooms[data.roomName] || rooms[data.roomName].status === 'playing') return;
        joinProcess(socket, data.roomName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName); socket.roomName = rName;
        let r = rooms[rName];
        
        // Modlara göre HP belirleme (OSMAN'IN KURALLARI)
        let startingHP = 1;
        if (r.mode === 'zombi') startingHP = 10;
        else if (r.mode === 'savas') startingHP = 3;
        else if (r.mode === 'labirent') startingHP = Infinity;

        r.players[socket.id] = { 
            x: 185, y: 185, name: uName || "Osman", 
            color: '#' + Math.floor(Math.random()*16777215).toString(16),
            hp: startingHP, maxHp: startingHP, 
            team: (Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue'), // Takım atama
            lastDir: 'up', lastFire: 0
        };
        
        socket.emit('joined', { isLeader: (r.leader === socket.id) });
        io.to(rName).emit('updatePlayerList', Object.values(r.players).map(p => ({name: p.name})));
    }

    // --- ADMIN KOMUTU ---
    socket.on('adminChangeMode', (newMode) => {
        let r = rooms[socket.roomName];
        if(r && r.leader === socket.id) {
            r.mode = newMode;
            for(let id in r.players) {
                let p = r.players[id];
                p.hp = (newMode === 'zombi' ? 10 : (newMode === 'savas' ? 3 : (newMode === 'bayrak' ? 1 : Infinity)));
                p.maxHp = p.hp;
            }
            io.to(socket.roomName).emit('state', { players: r.players, mode: r.mode });
        }
    });

    socket.on('startGameSignal', () => {
        let r = rooms[socket.roomName];
        if(r && r.leader === socket.id) {
            r.status = 'playing';
            for(let id in r.players) { 
                let p = r.players[id];
                if(r.mode === 'bayrak') {
                    p.x = (p.team === 'red' ? 20 : 350); p.y = 185;
                } else if(r.mode === 'labirent') { 
                    p.x = 20; p.y = 350; 
                } else { 
                    p.x = Math.random()*350; p.y = Math.random()*350; 
                }
            }
            io.to(socket.roomName).emit('gameStarted');
        }
    });

    socket.on('move', (dir) => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing') return;
        let p = r.players[socket.id]; if(!p || p.hp <= 0) return;
        let nX = p.x, nY = p.y, step = 20;

        if (dir === 'up') nY -= step; if (dir === 'down') nY += step;
        if (dir === 'left') nX -= step; if (dir === 'right') nX += step;
        
        let walls = (r.mode === 'labirent' ? mazeWalls : []);
        let hit = walls.some(w => nX < w.x + w.w && nX + 25 > w.x && nY < w.y + w.h && nY + 25 > w.y);
        
        if (!hit && nX >= 0 && nX <= 375 && nY >= 0 && nY <= 375) { 
            p.x = nX; p.y = nY; p.lastDir = dir; 
        }

        // Bayrak Kapmaca Puan Kontrolü
        if(r.mode === 'bayrak') {
            if(p.team === 'red' && p.x > 350) { r.scores.red++; p.x = 20; }
            if(p.team === 'blue' && p.x < 20) { r.scores.blue++; p.x = 350; }
            if(r.scores.red >= 3 || r.scores.blue >= 3) {
                io.to(socket.roomName).emit('winner', (r.scores.red >= 3 ? "Kırmızı" : "Mavi") + " Takım Kazandı!");
                delete rooms[socket.roomName];
            }
        }
    });

    socket.on('fire', () => {
        let r = rooms[socket.roomName]; if(!r || r.status !== 'playing' || r.mode === 'labirent') return;
        let p = r.players[socket.id];
        let cooldown = (r.mode === 'savas' ? 1000 : 250);

        if(p && p.hp > 0 && Date.now() - p.lastFire > cooldown) {
            // OSMAN'IN İSTEDİĞİ 4-YÖNLÜ ATEŞ (SADECE BAYRAK MODUNDA VEYA HEPSİNDE)
            if(r.mode === 'bayrak') {
                ['up','down','left','right'].forEach(d => {
                    r.bullets.push({ x: p.x + 10, y: p.y + 10, dir: d, owner: socket.id });
                });
            } else {
                r.bullets.push({ x: p.x + 10, y: p.y + 10, dir: p.lastDir, owner: socket.id });
            }
            p.lastFire = Date.now();
        }
    });

    setInterval(() => {
        for(let name in rooms) {
            let r = rooms[name]; if(r.status !== 'playing') continue;
            
            // Zombi Mantığı
            if(r.mode === 'zombi') {
                if(r.zombies.length < 5) r.zombies.push({x: Math.random()*380, y: 10});
                r.zombies.forEach(z => {
                    let targets = Object.values(r.players).filter(p => p.hp > 0);
                    if(targets.length > 0) {
                        z.x += (z.x < targets[0].x ? 1 : -1);
                        z.y += (z.y < targets[0].y ? 1 : -1);
                        if(Math.hypot(z.x - targets[0].x, z.y - targets[0].y) < 20) targets[0].hp -= 0.1;
                    }
                });
            }

            // Mermi Mantığı
            r.bullets.forEach((b, bi) => {
                b.x += (b.dir==='left'?-15:(b.dir==='right'?15:0)); 
                b.y += (b.dir==='up'?-15:(b.dir==='down'?15:0));
                
                if(b.x<0 || b.x>400 || b.y<0 || b.y>400) { r.bullets.splice(bi, 1); return; }
                
                for(let id in r.players) {
                    let target = r.players[id];
                    if(id !== b.owner && target.hp > 0 && b.x < target.x+25 && b.x+8 > target.x && b.y < target.y+25 && b.y+8 > target.y) {
                        target.hp -= 1;
                        r.bullets.splice(bi, 1);
                        break;
                    }
                }
            });
            io.to(name).emit('state', { players: r.players, mode: r.mode, bullets: r.bullets, zombies: r.zombies, scores: r.scores });
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);
