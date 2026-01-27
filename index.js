const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

let players = {};
let bullets = [];
let zombies = [];
let currentMode = 'bekle';
let wave = 1;
let zombiesSpawnedInWave = 0;

// Zombilerin sadece dış kenarlardan doğmasını sağlayan fonksiyon
function getRandomSpawnPos() {
    const side = Math.floor(Math.random() * 4);
    const margin = 40; 
    if(side === 0) return {x: Math.random() * 400, y: -margin};          // Üst
    if(side === 1) return {x: Math.random() * 400, y: 400 + margin};    // Alt
    if(side === 2) return {x: -margin, y: Math.random() * 400};          // Sol
    return {x: 400 + margin, y: Math.random() * 400};                   // Sağ
}

io.on('connection', (socket) => {
    players[socket.id] = { 
        x: 200, y: 200, name: "Oyuncu", 
        color: '#' + Math.floor(Math.random()*16777215).toString(16),
        hp: 10, lastDir: 'up', lastFire: 0, lastBlast: 0, active: false 
    };

    socket.on('setMode', (mode) => { 
        currentMode = mode; bullets = []; zombies = []; wave = 1; zombiesSpawnedInWave = 0;
        for(let id in players) { 
            players[id].hp = (mode === 'zombi' ? 10 : 3);
            players[id].active = true;
        }
    });

    socket.on('areaBlast', () => {
        let p = players[socket.id];
        const now = Date.now();
        if(p && p.hp > 0 && p.active && (now - p.lastBlast > 15000)) {
            p.lastBlast = now;
            zombies = zombies.filter(z => Math.hypot(p.x - z.x, p.y - z.y) > 150);
            io.emit('blastEffect', { x: p.x + 12, y: p.y + 12 });
        }
    });

    socket.on('move', (dir) => {
        let p = players[socket.id]; if(!p || p.hp <= 0 || !p.active) return;
        p.lastDir = dir;
        let nX = p.x, nY = p.y;
        if (dir === 'up') nY -= 20; if (dir === 'down') nY += 20;
        if (dir === 'left') nX -= 20; if (dir === 'right') nX += 20;
        if (nX >= 5 && nX <= 370 && nY >= 0 && nY <= 375) { p.x = nX; p.y = nY; }
    });

    socket.on('fire', () => {
        let p = players[socket.id];
        if(p && p.hp > 0 && p.active && Date.now() - p.lastFire > 100) {
            bullets.push({ x: p.x + 10, y: p.y + 10, dir: p.lastDir, owner: socket.id });
            p.lastFire = Date.now();
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

setInterval(() => {
    if(currentMode === 'zombi') {
        let maxZ = 3 + (wave * 2);
        if(zombies.length < maxZ && zombiesSpawnedInWave < maxZ) {
            let pos = getRandomSpawnPos();
            zombies.push({ x: pos.x, y: pos.y, hp: 1 + Math.floor(wave/3) });
            zombiesSpawnedInWave++;
        }
        if(zombies.length === 0 && zombiesSpawnedInWave >= maxZ) { wave++; zombiesSpawnedInWave = 0; }
        zombies.forEach(z => {
            let target = null; let minDist = 1000;
            for(let id in players) {
                let p = players[id]; if(p.hp <= 0) continue;
                let d = Math.hypot(p.x - z.x, p.y - z.y);
                if(d < minDist) { minDist = d; target = p; }
            }
            if(target) {
                if(z.x < target.x) z.x += 1.2; else z.x -= 1.2;
                if(z.y < target.y) z.y += 1.2; else z.y -= 1.2;
                if(minDist < 20 && Math.random() > 0.97) target.hp -= 1;
            }
        });
    }
    bullets.forEach((b, bi) => {
        if (b.dir === 'up') b.y -= 15; else if (b.dir === 'down') b.y += 15;
        else if (b.dir === 'left') b.x -= 15; else if (b.dir === 'right') b.x += 15;
        zombies.forEach((z, zi) => {
            if(b.x < z.x+25 && b.x+8 > z.x && b.y < z.y+25 && b.y+8 > z.y) {
                z.hp -= 1; bullets.splice(bi, 1);
                if(z.hp <= 0) zombies.splice(zi, 1);
            }
        });
    });
    io.emit('state', { players, bullets, zombies, mode: currentMode, wave });
}, 50);

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0');