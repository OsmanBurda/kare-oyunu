const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

let rooms = {}; 
const mazeWalls = [{ x: 0, y: 300, w: 340, h: 10 }, { x: 60, y: 220, w: 340, h: 10 }, { x: 0, y: 140, w: 340, h: 10 }, { x: 60, y: 60, w: 340, h: 10 }];
const baseWalls = [{x: 0, y: 80, w: 100, h: 10}, {x: 300, y: 310, w: 100, h: 10}];

io.on('connection', (socket) => {
    socket.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));

    socket.on('createRoom', (data) => {
        const rName = data.roomName || "Oda_" + Math.floor(Math.random()*1000);
        if (rooms[rName]) return socket.emit('err', 'Oda zaten var!');
        rooms[rName] = { 
            players: {}, bullets: [], zombies: [], mode: data.mode, wave: 1, spawned: 0, status: 'lobby', 
            leader: socket.id, redFlag: {x: 30, y: 30, carrier: null}, blueFlag: {x: 345, y: 345, carrier: null},
            scores: { Kırmızı: 0, Mavi: 0 }
        };
        joinProcess(socket, rName, data.userName, data.team);
    });

    socket.on('joinExistingRoom', (data) => {
        if (!rooms[data.roomName] || rooms[data.roomName].status === 'playing') return socket.emit('err', 'Giriş kapalı!');
        joinProcess(socket, data.roomName, data.userName, data.team);
    });

    function joinProcess(socket, rName, uName, team) {
        socket.join(rName); socket.roomName = rName;
        let r = rooms[rName];
        let initialHp = (r.mode === 'zombi' ? 10 : (r.mode === 'bayrak' ? 1 : 3));
        let pColor = (r.mode === 'bayrak') ? (team === 'Kırmızı' ? '#ff4444' : '#4444ff') : '#' + Math.floor(Math.random()*16777215).toString(16);
        
        r.players[socket.id] = { 
            x: 185, y: 185, name: uName || "Kare", color: pColor, team: (r.mode === 'bayrak' ? team : null), 
            hp: initialHp, active: false, lastDir: 'up', lastFire: 0, lastBlast: 0 
        };
        
        socket.emit('joined', { isLeader: (r.leader === socket.id) });
        // Odadaki herkese güncel oyuncu listesini gönder
        io.to(rName).emit('updatePlayerList', Object.values(r.players).map(p => ({name: p.name, team: p.team})));
        io.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));
    }

    socket.on('startGameSignal', () => {
        let r = rooms[socket.roomName];
        if(r && r.leader === socket.id && r.status === 'lobby') {
            r.status = 'playing';
            for(let id in r.players) { 
                let p = r.players[id]; p.active = true; 
                if(r.mode === 'bayrak') { p.x = p.team === 'Kırmızı' ? 20 : 350; p.y = p.team === 'Kırmızı' ? 20 : 350; }
                else { p.x = 20 + Math.random() * 350; p.y = 20 + Math.random() * 350; }
            }
            io.to(socket.roomName).emit('gameStarted');
        }
    });

    socket.on('disconnect', () => {
        if(socket.roomName && rooms[socket.roomName]) {
            let r = rooms[socket.roomName];
            delete r.players[socket.id];
            if (Object.keys(r.players).length === 0) { delete rooms[socket.roomName]; }
            else {
                if(r.leader === socket.id) r.leader = Object.keys(r.players)[0];
                io.to(socket.roomName).emit('updatePlayerList', Object.values(r.players).map(p => ({name: p.name, team: p.team})));
            }
            io.emit('roomList', Object.keys(rooms).map(k => ({name:k, mode:rooms[k].mode, count:Object.keys(rooms[k].players).length})));
        }
    });
    // ... (Hareket, Ateş ve Mermi mantığı aynı kalıyor)
});
http.listen(process.env.PORT || 3000);