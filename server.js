const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`[RL0] Сервер запущен на порту ${port}`);
});

const wss = new WebSocket.Server({ server });
const clients = new Map();
const userMessageHistory = new Map();

// === ХРАНИЛИЩЕ ИСТОРИИ ===
const HISTORY_FILE = 'history.json';
let messageHistory = [];

try {
  if (fs.existsSync(HISTORY_FILE)) {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    messageHistory = JSON.parse(data);
    console.log(`[RL0] Загружено ${messageHistory.length} сообщений`);
  }
} catch (e) {
  console.log('[RL0] Ошибка загрузки истории');
}

// === ЗАЩИТА ===
const MAX_MESSAGE_SIZE = 1024;
const MESSAGE_LIMIT_PER_MINUTE = 10;
const MAX_CLIENTS = 20;

// === ПОЛЬЗОВАТЕЛИ ===
const users = {
  'red': 'a7k2p-8r9t4-w3x6z',
  'shadow': 'm9n5q-2v6b8-y4c3e',
  'zero': 'r1t7h-5p9k2-s4w8j',
  'ddos': 'd4a2s-5f3g7-h8j9k',
  'osint': 'o1s2i-3n4t5-r6g7h',
  'crypto': 'c8r7y-2p5t9-k3m1n',
  'dev': 'd5e6v-8r2t4-x7c9q',
  'social': 's0c1a-4l6p7-z8x2v',
  'analyst': 'a9n8l-6y5t3-r2e1w'
};

function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(messageHistory, null, 2));
  } catch (e) {
    console.log('[RL0] Ошибка сохранения истории');
  }
}

function broadcast(msg) {
  for (const [nick, client] of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  }
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

      // АВТОРИЗАЦИЯ
      if (data.type === 'auth') {
        if (users[data.nick] && users[data.nick] === data.pass && !clients.has(data.nick)) {
          nick = data.nick;
          clients.set(nick, ws);
          userMessageHistory.set(nick, []);
          ws.send(JSON.stringify({ type: 'auth', status: 'ok' }));

          // Отправка последних 50 сообщений
          const lastMessages = messageHistory.slice(-50);
          for (const msg of lastMessages) {
            ws.send(JSON.stringify({ type: 'message', nick: msg.nick, text: msg.text }));
          }

          broadcast({ type: 'message', nick: 'system', text: nick + ' зашёл в чат' });
        } else {
          ws.send(JSON.stringify({ type: 'auth', status: 'fail' }));
        }
      }

      // СООБЩЕНИЕ
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
        if (messageHistory.length > 1000) {
          messageHistory = messageHistory.slice(-1000);
        }
        saveHistory();

        broadcast({ type: 'message', nick, text: data.text });
      }

      // PING
      else if (data.type === 'ping' && nick) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }

    } catch (e) {
      // Игнорируем битые сообщения
    }
  });

  ws.on('close', () => {
    if (nick) {
      clients.delete(nick);
      userMessageHistory.delete(nick);
      broadcast({ type: 'message', nick: 'system', text: nick + ' покинул чат' });
    }
  });
});
