const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Store active rooms and players
const rooms = {};

// Use environment variable for port (required for Render)
const PORT = process.env.PORT || 3000;

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Join a room
  socket.on('joinRoom', (roomId, playerName) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { players: [], impostor: null };
    }
    rooms[roomId].players.push({ id: socket.id, name: playerName, role: 'crewmate' });
    io.to(roomId).emit('updateRoom', rooms[roomId]);
  });

  // Assign roles (Impostor and Crewmates)
  socket.on('startGame', (roomId) => {
    const room = rooms[roomId];
    if (room.players.length >= 4) {
      const impostorIndex = Math.floor(Math.random() * room.players.length);
      room.players[impostorIndex].role = 'impostor';
      room.impostor = room.players[impostorIndex].id;
      io.to(roomId).emit('gameStarted', room.players);
    } else {
      io.to(roomId).emit('error', 'Not enough players to start the game.');
    }
  });

  // Handle tasks and sabotages
  socket.on('completeTask', (roomId, taskId) => {
    const room = rooms[roomId];
    io.to(roomId).emit('taskCompleted', { playerId: socket.id, taskId });
  });

  socket.on('sabotage', (roomId) => {
    const room = rooms[roomId];
    if (socket.id === room.impostor) {
      io.to(roomId).emit('sabotageTriggered');
    }
  });

  // Handle voting
  socket.on('callMeeting', (roomId) => {
    io.to(roomId).emit('meetingCalled', socket.id);
  });

  socket.on('vote', (roomId, votedPlayerId) => {
    const room = rooms[roomId];
    if (!room.votes) room.votes = {};
    room.votes[socket.id] = votedPlayerId;
    if (Object.keys(room.votes).length === room.players.length) {
      const voteCounts = {};
      for (const voter in room.votes) {
        const voted = room.votes[voter];
        voteCounts[voted] = (voteCounts[voted] || 0) + 1;
      }
      const ejectedPlayerId = Object.keys(voteCounts).reduce((a, b) => voteCounts[a] > voteCounts[b] ? a : b);
      io.to(roomId).emit('playerEjected', ejectedPlayerId);
    }
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(player => player.id !== socket.id);
      if (rooms[roomId].players.length === 0) delete rooms[roomId];
      else io.to(roomId).emit('updateRoom', rooms[roomId]);
    }
  });
});

// Start the server
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));