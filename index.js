// --- OSMAN'IN KALICI AYARLARI ---
const can = 3; 
const cooldownSuresi = 1000; // Savaş modunda 1 saniye
const gucTusu = 'b'; // Sadece 'b' çalışır
const atesYonSırayısı = 4; // 4 tarafa ateş kalıcı

let sonAtes = 0;
let aktifMod = "bayrak";

// Oyun Başlangıç Uyarısı
alert("OSMAN SİSTEMİ YÜKLENDİ:\n- Admin, Labirent, Zombi Aktif\n- 4 Yöne Ateş & 1s Cooldown\n- 3 Can & B Gücü");

window.addEventListener("keydown", (e) => {
    let tus = e.key.toLowerCase();

    // Özel Güç
    if (tus === gucTusu) {
        console.log("Osman Admin Özel Gücü!");
    }

    // Ateş Etme Kuralları
    if (tus === " " || tus === "f") {
        if (aktifMod === "bayrak") return; // Bayrakta ateş yok

        let simdi = Date.now();
        if (simdi - sonAtes >= cooldownSuresi) {
            console.log("4 Yöne Ateşlendi! (1 HP Hasar)");
            sonAtes = simdi;
        }
    }
});

console.log("Oyun dosyaları senkronize edildi.");
