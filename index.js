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

// Kalıcı Labirent Duvarları
const mazeWalls = [
    { x: 0, y: 300, w: 340, h: 10 }, { x: 60, y: 220, w: 340, h: 10 },
    { x: 0, y: 140, w: 340, h: 10 }, { x: 60, y: 60, w: 340, h: 10 },
    { x: 0, y: 0, w: 5, h: 400 }, { x: 395, y: 0, w: 5, h: 400 }
];

function getRandomPos() {
    return { x: Math.floor(Math.random() * 350) + 10, y: Math.floor(Math.random() * 350) + 10 };
}

io.on('connection', (socket) => {
    players[socket.id] = { 
        x: 200, y: 200, name: "Oyuncu", 
        color: '#' + Math.floor(Math.random()*16777215).toString(16),
        hp: 3, lastDir: 'up', lastFire: 0, active: false 
    };

    socket.on('setMode', (mode) => { 
        currentMode = mode; bullets = []; zombies = []; wave = 1; zombiesSpawnedInWave = 0;
        for(let id in players) { 
            let pPos = (mode === 'labirent') ? {x: 180, y: 360} : getRandomPos();
            players[id].hp = (mode === 'zombi' ? 10 : 3);
            players[id].x = pPos.x; players[id].y = pPos.y; 
            players[id].active = true;
        }
    });

    socket.on('setName', (name) => { if(players[socket.id]) players[socket.id].name = name || "Adsız"; });

    socket.on('move', (dir) => {
        let p = players[socket.id]; if(!p || p.hp <= 0 || !p.active) return;
        p.lastDir = dir;
        let nX = p.x, nY = p.y;
        if (dir === 'up') nY -= 20; if (dir === 'down') nY += 20;
        if (dir === 'left') nX -= 20; if (dir === 'right') nX += 20;

        let walls = (currentMode === 'labirent') ? mazeWalls : [];
        let hit = walls.some(w => nX < w.x + w.w && nX + 25 > w.x && nY < w.y + w.h && nY + 25 > w.y);
        
        if (!hit && nX >= 5 && nX <= 370 && nY >= 0 && nY <= 375) { p.x = nX; p.y = nY; }

        if (currentMode === 'labirent' && p.y <= 15) {
            io.emit('winner', p.name + " LABİRENTİ BİTİRDİ! 🏆");
        }
    });

    socket.on('fire', () => {
        let p = players[socket.id];
        let simdi = Date.now();
        let cooldown = (currentMode === 'zombi') ? 100 : 800; // Zombide 0.1s ateş hızı
        if(p && p.hp > 0 && p.active && simdi - p.lastFire > cooldown) {
            bullets.push({ x: p.x + 10, y: p.y + 10, dir: p.lastDir, owner: socket.id });
            p.lastFire = simdi;
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

setInterval(() => {
    if(currentMode === 'zombi') {
        let maxZ = 3 + (wave * 2);
        if(zombies.length < maxZ && zombiesSpawnedInWave < maxZ) {
            zombies.push({ x: Math.random()*400, y: -20, hp: 1 + Math.floor(wave/3) });
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
        if(b.y < -50 || b.y > 450 || b.x < -50 || b.x > 450) bullets.splice(bi, 1);

        zombies.forEach((z, zi) => {
            if(b.x < z.x+25 && b.x+8 > z.x && b.y < z.y+25 && b.y+8 > z.y) {
                z.hp -= 1; bullets.splice(bi, 1);
                if(z.hp <= 0) zombies.splice(zi, 1);
            }
        });

        if(currentMode === 'savas') {
            for(let id in players) {
                let p = players[id];
                if(id !== b.owner && p.hp > 0 && b.x < p.x+25 && b.x+8 > p.x && b.y < p.y+25 && b.y+8 > p.y) {
                    p.hp -= 1; bullets.splice(bi, 1); break;
                }
            }
        }
    });
    io.emit('state', { players, walls: (currentMode === 'labirent' ? mazeWalls : []), bullets, zombies, mode: currentMode, wave });
}, 50);

http.listen(3000, '0.0.0.0');