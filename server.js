const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const rooms = {};
const celebrities = Array.from({ length: 20 }, (_, idx) => ({
  id: idx + 1,
  name: `Celebrity ${idx + 1}`,
  category: ['Sports', 'Acting', 'Music'][Math.floor(Math.random() * 3)],
  image: `https://placehold.co/200x200?text=Celebrity+${idx + 1}`,
}));

function generateRoomId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: 5 }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', (playerName) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      players: [{ id: socket.id, name: playerName }],
      celebrities: [...celebrities],
      chosenCelebrities: {},
      eliminatedIds: [],
      currentTurn: null,
    };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, celebrities: rooms[roomId].celebrities });
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room || room.players.length >= 2) return socket.emit('error', 'Room not found or already full');
    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomId);

    io.to(roomId).emit('playerJoined', { players: room.players, celebrities: room.celebrities });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (!room) continue;

      room.players = room.players.filter((p) => p.id !== socket.id);

      if (room.players.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('playerLeft', socket.id);
      }
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
