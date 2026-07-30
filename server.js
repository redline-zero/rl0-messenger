const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Для статики (если нужно)
app.use(express.static('public'));

const server = app.listen(port, () => {
  console.log(`[RL0] Сервер запущен на порту ${port}`);
});

const wss = new WebSocket.Server({ server });

// Хранилище подключений
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('[RL0] Новое подключение');
  clients.add(ws);

  ws.on('message', (message) => {
    const msgString = message.toString();
    console.log('[RL0] Получено:', msgString);

    // Отправляем всем остальным
    clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(msgString);
      }
    });
  });

  ws.on('close', () => {
    console.log('[RL0] Клиент отключился');
    clients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[RL0] Ошибка WebSocket:', err);
  });
});
