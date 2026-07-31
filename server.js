#!/usr/bin/env python3
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import json
import os
from datetime import datetime

app = Flask(__name__)
app.secret_key = "redline_zero_secret_2025"
socketio = SocketIO(app, cors_allowed_origins="*")

# Хранилище сообщений и пользователей
messages = []
users = {}

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/status")
def status():
    return jsonify({
        "status": "online",
        "time": datetime.now().isoformat(),
        "users": len(users),
        "messages": len(messages)
    })

@socketio.on("connect")
def handle_connect():
    print(f"🔌 Клиент подключён: {request.sid}")

@socketio.on("disconnect")
def handle_disconnect():
    for username, sid in list(users.items()):
        if sid == request.sid:
            del users[username]
            emit("user_left", {"username": username}, broadcast=True)
            break

@socketio.on("join")
def handle_join(data):
    username = data.get("username", "Аноним")
    users[username] = request.sid
    emit("user_joined", {"username": username, "users": list(users.keys())}, broadcast=True)

@socketio.on("message")
def handle_message(data):
    username = data.get("username", "Аноним")
    text = data.get("message", "")
    msg = {
        "username": username,
        "text": text,
        "time": datetime.now().strftime("%H:%M")
    }
    messages.append(msg)
    if len(messages) > 100:
        messages.pop(0)
    emit("new_message", msg, broadcast=True)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=False)
