const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const player = {
    x: 100, y: 100, size: 30, speed: 5,
    hp: 3, maxHp: 3, lastShot: 0, cooldown: 1000, 
    mode: 'vs'
};

// Admin Paneli Fonksiyonu
function toggleAdmin() {
    const panel = document.getElementById('adminPanel');
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

// Mod Değişince HP Otomatik Güncellenir
function setMode(mode) {
    player.mode = mode;
    document.getElementById('modeDisplay').innerText = mode.toUpperCase();
    
    if (mode === 'flag') { 
        player.hp = 1; player.maxHp = 1; 
    } else if (mode === 'vs') { 
        player.hp = 3; player.maxHp = 3; player.cooldown = 1000; 
    } else if (mode === 'zombie') { 
        player.hp = 10; player.maxHp = 10; 
    } else if (mode === 'maze') { 
        player.hp = Infinity; 
    }
    
    updateUI();
    toggleAdmin();
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') toggleAdmin();
    if (e.code === 'KeyB') console.log("Özel Güç B Kullanıldı!"); 
    if (e.code === 'Space') shoot();
});

function shoot() {
    // Savaş modunda 1 saniye cooldown kuralı (kalıcı)
    if (Date.now() - player.lastShot < player.cooldown) return;
    player.lastShot = Date.now();
    console.log("Ateşlendi! (4 Yön Aktif)");
}

function updateUI() {
    document.getElementById('hpDisplay').innerText = player.hp === Infinity ? "Ölümsüz" : player.hp;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = player.mode === 'flag' ? '#00ccff' : '#ff3333';
    ctx.fillRect(player.x, player.y, player.size, player.size);
    
    // Labirent değilse HP Barı göster
    if (player.mode !== 'maze') {
        ctx.fillStyle = '#444'; ctx.fillRect(player.x, player.y - 10, player.size, 5);
        ctx.fillStyle = '#00ff00'; ctx.fillRect(player.x, player.y - 10, (player.hp / player.maxHp) * player.size, 5);
    }
    requestAnimationFrame(draw);
}

draw();
