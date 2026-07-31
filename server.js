const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// === ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ ===
const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));

// === ИСТОРИЯ ===
const HISTORY_FILE = 'history.json';
let messageHistory = [];
if (fs.existsSync(HISTORY_FILE)) {
  try {
    messageHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    console.log(`[RL0] Загружено ${messageHistory.length} сообщений`);
  } catch (e) {}
}

// === СЕРВЕР ===
const server = app.listen(port, () => {
  console.log(`[RL0] Сервер запущен на порту ${port}`);
});

const wss = new WebSocket.Server({ server });
const clients = new Map();

// === ЗАЩИТА ===
const MAX_MESSAGE_SIZE = 1024;
const MESSAGE_LIMIT_PER_MINUTE = 10;
const MAX_CLIENTS = 20;
const userMessageHistory = new Map();

function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(messageHistory, null, 2));
  } catch (e) {}
}

wss.on('connection', (ws) => {
  if (clients.size >= MAX_CLIENTS) {
    ws.close(1008, 'Сервер переполнен');
    return;
  }

  let nick = null;

  ws.on('message', (message) => {
    try {
      if (message.length > MAX_MESSAGE_SIZE) {
        ws.send(JSON.stringify({ type: 'error', text: 'Сообщение слишком большое' }));
        return;
      }

      const data = JSON.parse(message);

      if (data.type === 'auth') {
        const user = users[data.nick];
        if (user && user.pass === data.pass && !clients.has(data.nick)) {
          nick = data.nick;
          clients.set(nick, ws);
          userMessageHistory.set(nick, []);
          ws.send(JSON.stringify({ type: 'auth', status: 'ok', role: user.role }));

          const lastMessages = messageHistory.slice(-50);
          for (const msg of lastMessages) {
            ws.send(JSON.stringify({ type: 'message', nick: msg.nick, text: msg.text }));
          }

          broadcast({ type: 'message', nick: 'system', text: `${nick} (${user.role}) зашёл в чат` });
        } else {
          ws.send(JSON.stringify({ type: 'auth', status: 'fail' }));
        }
      }

      else if (data.type === 'message' && nick) {
        const now = Date.now();
        const history = userMessageHistory.get(nick) || [];
        const filtered = history.filter(t => now - t < 60000);

        if (filtered.length >= MESSAGE_LIMIT_PER_MINUTE) {
          ws.send(JSON.stringify({ type: 'error', text: 'Слишком много сообщений' }));
          return;
        }

        filtered.push(now);
        userMessageHistory.set(nick, filtered);

        const entry = { nick, text: data.text, time: new Date().toISOString() };
        messageHistory.push(entry);
        if (messageHistory.length > 1000) messageHistory = messageHistory.slice(-1000);
        saveHistory();

        broadcast({ type: 'message', nick, text: data.text });
      }

      else if (data.type === 'ping' && nick) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }

    } catch (e) {}
  });

  ws.on('close', () => {
    if (nick) {
      clients.delete(nick);
      userMessageHistory.delete(nick);
      broadcast({ type: 'message', nick: 'system', text: nick + ' покинул чат' });
    }
  });
});

function broadcast(msg) {
  for (let [, client] of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  }
}
