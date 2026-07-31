const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ============================================================
//  РАЗРЕШАЕМ JSON
// ============================================================
app.use(express.json());

// ============================================================
//  БАЗА ПОЛЬЗОВАТЕЛЕЙ
// ============================================================
const USERS = {
    'red': {
        password: 'a7k2p-8r9t4-w3x6z',
        role: 'Совет',
        branch: 'R-1'
    },
    'shadow': {
        password: 'm9n5q-2v6b8-y4c3e',
        role: 'Совет',
        branch: 'R-2'
    },
    'zero': {
        password: 'r1t7h-5p9k2-s4w8j',
        role: 'Совет',
        branch: 'R-3'
    },
    'ddos': {
        password: 'd4a2s-5f3g7-h8j9k',
        role: 'Ветвь DA',
        branch: 'DA'
    },
    'osint': {
        password: 'o1s2i-3n4t5-r6g7h',
        role: 'Ветвь OR',
        branch: 'OR'
    },
    'crypto': {
        password: 'c8r7y-2p5t9-k3m1n',
        role: 'Ветвь CR',
        branch: 'CR'
    },
    'dev': {
        password: 'd5e6v-8r2t4-x7c9q',
        role: 'Ветвь CT/AB',
        branch: 'CT/AB'
    },
    'social': {
        password: 's0c1a-4l6p7-z8x2v',
        role: 'Ветвь PR',
        branch: 'PR'
    },
    'analyst': {
        password: 'a9n8l-6y5t3-r2e1w',
        role: 'Ветвь SC',
        branch: 'SC'
    }
};

// ============================================================
//  ХРАНИЛИЩЕ
// ============================================================
const sessions = {};        // token → { username, role, branch }
const onlineUsers = {};     // username → { role, branch, socketId }
const messages = [];        // все сообщения с id
let messageId = 0;

// ============================================================
//  API — АВТОРИЗАЦИЯ
// ============================================================

// Логин
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = USERS[username];

    if (!user) {
        return res.status(401).json({ error: 'Позывной не найден' });
    }

    if (user.password !== password) {
        return res.status(401).json({ error: 'Неверный пароль' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions[token] = {
        username: username,
        role: user.role,
        branch: user.branch
    };

    res.json({
        token: token,
        user: {
            username: username,
            role: user.role,
            branch: user.branch
        }
    });
});

// Проверка токена
app.post('/api/verify', (req, res) => {
    const { token } = req.body;
    const session = sessions[token];
    if (!session) {
        return res.status(401).json({ error: 'Неавторизован' });
    }
    res.json({ valid: true, user: session });
});

// ============================================================
//  API — ЧАТ
// ============================================================

// Статус сервера
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        users: Object.keys(onlineUsers).length,
        messages: messages.length
    });
});

// Список всех пользователей (с онлайном)
app.get('/api/users', (req, res) => {
    const list = Object.entries(USERS).map(([username, data]) => ({
        username,
        role: data.role,
        branch: data.branch,
        online: !!onlineUsers[username]
    }));
    res.json(list);
});

// ПОЛУЧЕНИЕ СООБЩЕНИЙ (с автообновлением)
app.get('/api/messages', (req, res) => {
    const after = parseInt(req.query.after) || 0;
    const newMessages = messages.filter(m => m.id > after);
    res.json({
        messages: newMessages,
        lastId: messages.length > 0 ? messages[messages.length - 1].id : 0
    });
});

// ============================================================
//  SOCKET.IO (с авторизацией)
// ============================================================

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token || !sessions[token]) {
        return next(new Error('Неавторизован'));
    }
    socket.session = sessions[token];
    next();
});

io.on('connection', (socket) => {
    const { username, role, branch } = socket.session;
    console.log(`🔌 ${username} (${role} | ${branch}) подключился`);

    // Сохраняем в онлайн
    onlineUsers[username] = {
        role,
        branch,
        socketId: socket.id
    };

    // Отправляем новому пользователю его данные
    socket.emit('auth_success', {
        username,
        role,
        branch,
        users: Object.keys(onlineUsers)
    });

    // Всем — что новый пользователь в сети
    io.emit('user_joined', {
        username,
        role,
        branch,
        users: Object.keys(onlineUsers)
    });

    // ====== ОБРАБОТКА СООБЩЕНИЙ ======
    socket.on('message', (data) => {
        const msg = {
            id: ++messageId,
            username: username,
            role: role,
            branch: branch,
            text: data.message,
            time: new Date().toLocaleTimeString()
        };
        messages.push(msg);
        if (messages.length > 100) messages.shift();

        // Отправляем всем
        io.emit('new_message', msg);
    });

    // ====== ОТКЛЮЧЕНИЕ ======
    socket.on('disconnect', () => {
        delete onlineUsers[username];
        io.emit('user_left', { username });
        console.log(`⛔ ${username} отключился`);
    });
});

// ============================================================
//  ЗАПУСК СЕРВЕРА
// ============================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🔴 RedLine Zero сервер запущен на порту ${PORT}`);
    console.log(`👥 Зарегистрировано пользователей: ${Object.keys(USERS).length}`);
});
