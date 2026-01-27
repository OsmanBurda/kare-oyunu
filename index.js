const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const player = {
    x: 200, y: 200, size: 30, speed: 5,
    hp: 3, maxHp: 3, lastShot: 0, cooldown: 1000, 
    mode: 'vs',
    moving: { up: false, down: false, left: false, right: false }
};

// Mobil Hareket Fonksiyonu
function move(dir, state) {
    player.moving[dir] = state;
}

function toggleAdmin() {
    const panel = document.getElementById('adminPanel');
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function setMode(mode) {
    player.mode = mode;
    document.getElementById('modeDisplay').innerText = mode.toUpperCase();
    player.hp = (mode === 'flag') ? 1 : (mode === 'zombie' ? 10 : 3);
    player.maxHp = player.hp;
    if(mode === 'maze') player.hp = Infinity;
    document.getElementById('hpDisplay').innerText = player.hp === Infinity ? "∞" : player.hp;
    toggleAdmin();
}

function useSpecialPower() { console.log("B Gücü!"); }

function shoot() {
    if (Date.now() - player.lastShot < player.cooldown) return;
    player.lastShot = Date.now();
    console.log("Ateşlendi!");
}

// Ana Döngü
function update() {
    if (player.moving.up) player.y -= player.speed;
    if (player.moving.down) player.y += player.speed;
    if (player.moving.left) player.x -= player.speed;
    if (player.moving.right) player.x += player.speed;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = player.mode === 'flag' ? '#00ccff' : '#ff3333';
    ctx.fillRect(player.x, player.y, player.size, player.size);
    
    if (player.mode !== 'maze') {
        ctx.fillStyle = '#444'; ctx.fillRect(player.x, player.y - 10, player.size, 5);
        ctx.fillStyle = '#00ff00'; ctx.fillRect(player.x, player.y - 10, (player.hp / player.maxHp) * player.size, 5);
    }
    requestAnimationFrame(update);
}
update();
