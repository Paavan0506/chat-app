const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      process.env.CLIENT_URL,
      'https://chat-app-wheat-nine-56.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000',
    ].filter(Boolean),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({
  origin: [
    process.env.CLIENT_URL,
    'https://chat-app-wheat-nine-56.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/messages', require('./routes/messages'));

const onlineUsers = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('user_online', ({ username, room }) => {
    onlineUsers[socket.id] = { username, room };
    socket.join(room);
    io.to(room).emit('online_users', getOnlineInRoom(room));
  });

  socket.on('join_room', (room) => {
    socket.join(room);
    if (onlineUsers[socket.id]) {
      onlineUsers[socket.id].room = room;
      io.to(room).emit('online_users', getOnlineInRoom(room));
    }
  });

  socket.on('leave_room', (room) => {
    socket.leave(room);
    io.to(room).emit('online_users', getOnlineInRoom(room));
  });

  socket.on('send_message', async (data) => {
    try {
      const Message = require('./models/Message');
      const saved = await Message.create({
        room: data.room,
        sender: data.senderId,
        text: data.text,
      });
      const payload = {
        _id: saved._id,
        room: data.room,
        sender: data.sender,
        senderId: data.senderId,
        text: data.text,
        createdAt: saved.createdAt,
        seenBy: [],
      };
      io.to(data.room).emit('receive_message', payload);
    } catch (err) {
      console.error('Message save error:', err.message);
    }
  });

  socket.on('typing', ({ room, username }) => {
    socket.to(room).emit('user_typing', username);
  });

  socket.on('stop_typing', ({ room }) => {
    socket.to(room).emit('user_stop_typing');
  });

  socket.on('message_seen', ({ messageId, room, username }) => {
    socket.to(room).emit('message_seen', { messageId, username });
  });

  socket.on('disconnect', () => {
    const user = onlineUsers[socket.id];
    if (user) {
      const { room } = user;
      delete onlineUsers[socket.id];
      io.to(room).emit('online_users', getOnlineInRoom(room));
    }
    console.log('User disconnected:', socket.id);
  });
});

function getOnlineInRoom(room) {
  return Object.values(onlineUsers)
    .filter((u) => u.room === room)
    .map((u) => u.username);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected ✓');
    server.listen(5000, () => console.log('Server running on port 5000'));
  })
  .catch((err) => console.log('MongoDB error:', err.message));