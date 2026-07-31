const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Статика
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище
const users = {};
const messages = [];

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API статус
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        users: Object.keys(users).length,
        messages: messages.length
    });
});

// Socket.IO
io.on('connection', (socket) => {
    console.log('🔌 Клиент подключён:', socket.id);

    socket.on('join', (data) => {
        const username = data.username || 'Аноним';
        users[username] = socket.id;
        io.emit('user_joined', {
            username: username,
            users: Object.keys(users)
        });
    });

    socket.on('message', (data) => {
        const username = data.username || 'Аноним';
        const text = data.message || '';
        const msg = {
            username: username,
            text: text,
            time: new Date().toLocaleTimeString()
        };
        messages.push(msg);
        if (messages.length > 100) messages.shift();
        io.emit('new_message', msg);
    });

    socket.on('disconnect', () => {
        let leftUser = null;
        for (const [name, id] of Object.entries(users)) {
            if (id === socket.id) {
                leftUser = name;
                delete users[name];
                break;
            }
        }
        if (leftUser) {
            io.emit('user_left', { username: leftUser });
        }
        console.log('⛔ Клиент отключён:', socket.id);
    });
});

// Запуск
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🔴 RedLine Node.js запущен на порту ${PORT}`);
});
