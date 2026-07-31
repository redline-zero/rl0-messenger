const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ==================== НАСТРОЙКА ====================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'redline_zero_secret_key_2025',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// ==================== БАЗА ДАННЫХ ====================

const db = new sqlite3.Database('./messages.db');

db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        created_at TEXT
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room TEXT,
        username TEXT,
        message TEXT,
        timestamp TEXT
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        created_by TEXT,
        created_at TEXT
    )
`);

// ==================== РОУТЫ ====================

app.get('/', (req, res) => {
    if (req.session.username) {
        res.sendFile(path.join(__dirname, 'views', 'chat.html'));
    } else {
        res.redirect('/login');
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) {
            return res.status(403).send('Неверный логин или пароль');
        }
        bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
                req.session.username = username;
                res.redirect('/');
            } else {
                res.status(403).send('Неверный логин или пароль');
            }
        });
    });
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).send('Ошибка');
        db.run('INSERT INTO users (username, password, created_at) VALUES (?, ?, datetime("now"))', [username, hash], (err) => {
            if (err) {
                return res.status(400).send('Пользователь уже существует');
            }
            res.redirect('/login');
        });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
    console.log('Новое соединение');

    socket.on('join', (data) => {
        const room = data.room || 'general';
        socket.join(room);
        io.to(room).emit('message', {
            username: 'Система',
            message: `${socket.username || 'Аноним'} присоединился к ${room}`,
            timestamp: new Date().toLocaleTimeString()
        });
    });

    socket.on('message', (data) => {
        const room = data.room || 'general';
        const username = socket.username || 'Аноним';
        const message = data.message;
        
        db.run('INSERT INTO messages (room, username, message, timestamp) VALUES (?, ?, ?, datetime("now"))', [room, username, message]);
        
        io.to(room).emit('message', {
            username: username,
            message: message,
            timestamp: new Date().toLocaleTimeString()
        });
    });

    socket.on('create_room', (data) => {
        const room = data.room;
        const username = socket.username || 'Аноним';
        db.run('INSERT INTO rooms (name, created_by, created_at) VALUES (?, ?, datetime("now"))', [room, username], (err) => {
            if (err) {
                socket.emit('room_created', { room: room, status: 'error' });
            } else {
                socket.emit('room_created', { room: room, status: 'ok' });
            }
        });
    });

    socket.on('set_username', (data) => {
        socket.username = data.username;
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился');
    });
});

// ==================== ЗАПУСК ====================

server.listen(5000, '0.0.0.0', () => {
    console.log('🔴 RedLine Messenger запущен на порту 5000');
});
