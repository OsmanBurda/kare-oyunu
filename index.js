const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

let rooms = {};

// Duvarlar (Base Koruması)
const WALLS = [
    {x: 60, y: 100, w: 20, h: 200},  // Kırmızı Duvar
    {x: 320, y: 100, w: 20, h: 200}  // Mavi Duvar
];

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], 
            mode: data.mode || 'zombi', wave: 1,
            flags: { red: {x: 20, y: 190, taken: false}, blue: {x: 360, y: 190, taken: false} },
            scores: { red: 0, blue: 0 } // SKOR SİSTEMİ
        };
        joinProcess(socket, rName, data.userName);
    });

    function joinProcess(socket, rName, uName) {
        socket.join(rName);
        socket.roomName = rName;
        let r = rooms[rName];
        let team = (r.mode === 'bayrak' || r.mode === 'vs') ? (Object.keys(r.players).length % 2 === 0 ? 'red' : 'blue') : 'solo';
        
        // Oyuncu Başlangıç Ayarları
        r.players[socket.id] = { 
            id: socket.id, 
            x: (team==='red'?20:360), y: 190, // Doğuş yerleri
            hp: (r.mode === 'vs' ? 3 : 10), 
            name: uName || "Osman", 
            color: (team === 'red' ? 'red' : 'blue'), 
            lastSpecial: 0, lastFire: 0, team: team, hasFlag: false
        };
        socket.emit('joined', { mode: r.mode });
    }

    socket.on('fire', () => {
        let r = rooms[socket.roomName];
        let p = r?.players[socket.id];
        // Bayrak taşıyan ateş edemez, ölüler ateş edemez
        if (p && p.hp > 0 && !p.hasFlag && Date.now() - p.lastFire > 1000) { 
            p.lastFire = Date.now();
            if (r.mode === 'bayrak') {
                [[0,-7], [0,7], [-7,0], [7,0]].forEach(v => { // 4 Yön
                    r.bullets.push({ x: p.x+8, y: p.y+8, dx: v[0], dy: v[1], owner: socket.id });
                });
            } else {
                const v = { up: [0,-7], down: [0,7], left: [-7,0], right: [7,0] }[p.lastDir || 'up'];
                r.bullets.push({ x: p.x+8, y: p.y+8, dx: v[0], dy: v[1], owner: socket.id });
            }
        }
    });

    socket.on('move', (dir) => {
        let p = rooms[socket.roomName]?.players[socket.id];
        if (p && p.hp > 0) { // Sadece canlılar hareket eder
            p.lastDir = dir;
            let speed = p.hasFlag ? 10 : 20; // Bayrakla yavaşlama
            let newX = p.x, newY = p.y;

            if(dir==='up') newY -= speed; if(dir==='down') newY += speed; 
            if(dir==='left') newX -= speed; if(dir==='right') newX += speed;

            // Duvar Kontrolü
            let hitWall = false;
            if (rooms[socket.roomName].mode === 'bayrak') {
                WALLS.forEach(w => {
                    if (newX < w.x + w.w && newX + 25 > w.x && newY < w.y + w.h && newY + 25 > w.y) hitWall = true;
                });
            }

            if (!hitWall) {
                p.x = Math.max(0, Math.min(375, newX)); 
                p.y = Math.max(0, Math.min(375, newY));
            }
        }
    });

    socket.on('specialPower', () => {
        let r = rooms[socket.roomName]; let p = r?.players[socket.id];
        if (p && p.hp > 0 && Date.now() - p.lastSpecial > 15000) {
            p.lastSpecial = Date.now();
            io.to(socket.roomName).emit('specialEffect', { x: p.x+12, y: p.y+12 });
            if (r.mode === 'zombi') r.zombies = r.zombies.filter(z => Math.hypot(z.x-p.x, z.y-p.y) > 80);
        }
    });

    setInterval(() => {
        for (let n in rooms) {
            let r = rooms[n];
            
            // --- BAYRAK MODU MANTIĞI ---
            if (r.mode === 'bayrak') {
                for (let id in r.players) {
                    let p = r.players[id];
                    let enemyColor = p.team === 'red' ? 'blue' : 'red';
                    
                    // Bayrağı Alma
                    if (!p.hasFlag && !r.flags[enemyColor].taken && Math.hypot(p.x - r.flags[enemyColor].x, p.y - r.flags[enemyColor].y) < 30) {
                        p.hasFlag = true;
                        r.flags[enemyColor].taken = true;
                    }
                    
                    // Bayrağı Teslim Etme (SKOR KAZANMA)
                    let homeBaseX = p.team === 'red' ? 20 : 360;
                    if (p.hasFlag && Math.hypot(p.x - homeBaseX, p.y - 190) < 30) {
                        p.hasFlag = false;
                        r.flags[enemyColor].taken = false;
                        r.scores[p.team]++; // SKORU ARTIR
                        
                        // OYUN BİTİŞİ (3 PUAN)
                        if (r.scores[p.team] >= 3) {
                            io.to(n).emit('gameOver', { winner: p.team });
                            r.scores = { red: 0, blue: 0 }; // Skoru sıfırla
                            // Herkesi respawn yap
                            Object.values(r.players).forEach(pl => {
                                pl.x = (pl.team==='red'?20:360); pl.y = 190; pl.hp = 10; pl.hasFlag = false;
                            });
                        }
                    }
                }
            }

            // --- MERMİLER ---
            r.bullets.forEach((b, bi) => { 
                b.x += b.dx; b.y += b.dy; 
                if (r.mode === 'bayrak') {
                    WALLS.forEach(w => { if (b.x > w.x && b.x < w.x+w.w && b.y > w.y && b.y < w.y+w.h) r.bullets.splice(bi, 1); });
                }
                if (r.mode === 'zombi') {
                    r.zombies.forEach((z, zi) => {
                        if (Math.hypot(b.x - z.x, b.y - z.y) < 25) { r.zombies.splice(zi, 1); r.bullets.splice(bi, 1); }
                    });
                }
                if(b.x<0 || b.x>400 || b.y<0 || b.y>400) r.bullets.splice(bi,1); 
            });

            // --- ZOMBİ HASARI VE CAN KONTROLÜ ---
            if (r.mode === 'zombi') {
                if (r.zombies.length === 0) { // Yeni Dalga
                    r.wave++;
                    let count = r.wave * 3;
                    for(let i=0; i<count; i++) {
                        let side = Math.floor(Math.random()*4);
                        let zx = side===2?0:(side===3?400:Math.random()*400);
                        let zy = side===0?0:(side===1?400:Math.random()*400);
                        r.zombies.push({x: zx, y: zy});
                    }
                }
                r.zombies.forEach(z => {
                    let t = Object.values(r.players).find(pl => pl.hp > 0); // Sadece canlılara git
                    if(t) { 
                        z.x+=(z.x<t.x?0.5:-0.5); z.y+=(z.y<t.y?0.5:-0.5); 
                        if(Math.hypot(z.x-t.x,z.y-t.y)<20) {
                            t.hp -= 0.05; // Can azalt
                        }
                    }
                });
            }

            // --- ÖLÜM VE RESPAWN SİSTEMİ (Negatif Can Düzeltmesi) ---
            for(let id in r.players) {
                let p = r.players[id];
                if (p.hp <= 0) {
                    p.hp = 10; // Canı fulle
                    p.hasFlag = false; // Bayrağı düşür
                    if(r.mode === 'bayrak') r.flags[p.team==='red'?'blue':'red'].taken = false;
                    p.x = (p.team==='red'?20:360); // Base'e ışınla
                    p.y = 190;
                }
            }

            io.to(n).emit('state', { ...r, walls: WALLS });
        }
    }, 50);
});
http.listen(process.env.PORT || 3000);
