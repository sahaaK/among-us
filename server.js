const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins (update this in production)
    methods: ['GET', 'POST'],
  },
});

// Store active rooms and players
const rooms = {};

// Use environment variable for port (required for Render)
const PORT = process.env.PORT || 3000;

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Join a room
  socket.on('joinRoom', (roomId, playerName) => {
    console.log(`Player ${playerName} joining room ${roomId}`);
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = { players: [], impostor: null };
    }

    // Add player to the room
    rooms[roomId].players.push({ id: socket.id, name: playerName, role: 'crewmate' });

    // Notify all players in the room
    io.to(roomId).emit('updateRoom', rooms[roomId]);
  });

  // Assign roles (Impostor and Crewmates)
  socket.on('startGame', (roomId) => {
    const room = rooms[roomId];
    if (room.players.length >= 4) {
      // Randomly assign one player as the impostor
      const impostorIndex = Math.floor(Math.random() * room.players.length);
      room.players[impostorIndex].role = 'impostor';
      room.impostor = room.players[impostorIndex].id;

      // Notify all players in the room
      io.to(roomId).emit('gameStarted', room.players);
    } else {
      // Not enough players to start the game
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

    // Record the vote
    room.votes[socket.id] = votedPlayerId;

    // Check if all players have voted
    if (Object.keys(room.votes).length === room.players.length) {
      const voteCounts = {};
      for (const voter in room.votes) {
        const voted = room.votes[voter];
        voteCounts[voted] = (voteCounts[voted] || 0) + 1;
      }

      // Determine the player with the most votes
      const ejectedPlayerId = Object.keys(voteCounts).reduce((a, b) =>
        voteCounts[a] > voteCounts[b] ? a : b
      );

      // Notify all players in the room
      io.to(roomId).emit('playerEjected', ejectedPlayerId);
    }
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);

    // Remove the player from all rooms
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(
        (player) => player.id !== socket.id
      );

      // If the room is empty, delete it
      if (rooms[roomId].players.length === 0) {
        delete rooms[roomId];
      } else {
        // Notify remaining players in the room
        io.to(roomId).emit('updateRoom', rooms[roomId]);
      }
    }
  });
});

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});