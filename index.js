// --- OSMAN'IN KALICI AYARLARI ---
const can = 3; // VS'de 3 can kuralı
const cooldown = 1000; // Savaş modunda 1 saniye
const gucTusu = 'b'; // Sadece 'b' tuşu
let sonAtes = 0;
let aktifMod = "bayrak"; //

// Başlangıç Paneli
alert("OSMAN SİSTEMİ AKTİF!\n- 3 Can ve 1s Cooldown\n- 4 Yönlü Ateş\n- Bayrak, Zombi, Labirent Modları");

window.addEventListener("keydown", (e) => {
    let tus = e.key.toLowerCase();
    
    // Özel Güç
    if(tus === gucTusu) console.log("Özel Güç Aktif!");

    // Ateş Etme (4 Yönlü)
    if(tus === " " || tus === "f") {
        if(aktifMod === "bayrak") return; // Bayrakta ateş yok
        
        let simdi = Date.now();
        if(simdi - sonAtes >= cooldown) {
            console.log("4 Yöne Ateş Edildi!");
            sonAtes = simdi;
        }
    }
});
