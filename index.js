const socket = io(); // Diğer oyuncuları görmeni sağlar
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// --- OSMAN'IN KALICI AYARLARI ---
const can = 3; 
const cooldown = 1000; 
const gucTusu = 'b';
let sonAtes = 0;

// Odaya girenleri listeye ekle
socket.on('updatePlayers', (players) => {
    const list = document.getElementById("users");
    list.innerHTML = "";
    Object.values(players).forEach(p => {
        list.innerHTML += `<li>${p.name}</li>`;
    });
});

window.addEventListener("keydown", (e) => {
    let key = e.key.toLowerCase();
    if(key === gucTusu) alert("ADMIN GÜCÜ!");
    
    if(key === " ") { // 4 Yöne Ateş
        let simdi = Date.now();
        if(simdi - sonAtes >= cooldown) {
            console.log("4 Tarafa Ateşlendi!");
            sonAtes = simdi;
        }
    }
});
