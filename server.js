const express = require('express');
const WebSocket = require('ws');
const app = express();
const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`[RL0] Сервер запущен на порту ${port}`);
});

const wss = new WebSocket.Server({ server });
const clients = new Map();

// === ЗАЩИТА ===
const MAX_MESSAGE_SIZE = 1024;
const MESSAGE_LIMIT_PER_MINUTE = 10;
const MAX_CLIENTS = 20;
const messageHistory = new Map();

// === ПОЛЬЗОВАТЕЛИ ===
const users = {
  // СОВЕТ
  'red': 'a7k2p-8r9t4-w3x6z',
  'shadow': 'm9n5q-2v6b8-y4c3e',
  'zero': 'r1t7h-5p9k2-s4w8j',

  // ВЕТВИ (по 1 человеку)
  'ddos': 'd4a2s-5f3g7-h8j9k',
  'osint': 'o1s2i-3n4t5-r6g7h',
  'crypto': 'c8r7y-2p5t9-k3m1n',
  'dev': 'd5e6v-8r2t4-x7c9q',
  'social': 's0c1a-4l6p7-z8x2v',
  'analyst': 'a9n8l-6y5t3-r2e1w'
};

wss.on('connection', (ws) => {
  // === ЗАЩИТА ОТ ПЕРЕПОЛНЕНИЯ ===
  if (clients.size >= MAX_CLIENTS) {
    ws.close(1008, 'Сервер переполнен');
    return;
  }

  let nick = null;

  ws.on('message', (message) => {
    try {
      // === ЗАЩИТА ОТ СЛИШКОМ БОЛЬШИХ СООБЩЕНИЙ ===
      if (message.length > MAX_MESSAGE_SIZE) {
        ws.send(JSON.stringify({ type: 'error', text: 'Сообщение слишком большое' }));
        return;
      }

      const data = JSON.parse(message);

      // === АВТОРИЗАЦИЯ ===
      if (data.type === 'auth') {
        if (users[data.nick] && users[data.nick] === data.pass && !clients.has(data.nick)) {
          nick = data.nick;
          clients.set(nick, ws);
          messageHistory.set(nick, []);
          ws.send(JSON.stringify({ type: 'auth', status: 'ok' }));
          broadcast({ type: 'message', nick: 'system', text: nick + ' зашёл в чат' });
        } else {
          ws.send(JSON.stringify({ type: 'auth', status: 'fail' }));
        }
      }

      // === СООБЩЕНИЕ ===
      else if (data.type === 'message' && nick) {
        // === ЗАЩИТА ОТ ФЛУДА ===
        const now = Date.now();
        const history = messageHistory.get(nick) || [];
        const filtered = history.filter(t => now - t < 60000);

        if (filtered.length >= MESSAGE_LIMIT_PER_MINUTE) {
          ws.send(JSON.stringify({ type: 'error', text: 'Слишком много сообщений' }));
          return;
        }

        filtered.push(now);
        messageHistory.set(nick, filtered);

        broadcast({ type: 'message', nick, text: data.text });
      }

      // === PING (для проверки соединения) ===
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
      messageHistory.delete(nick);
      broadcast({ type: 'message', nick: 'system', text: nick + ' покинул чат' });
    }
  });
});

function broadcast(msg) {
  for (let [nick, client] of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  }
}
