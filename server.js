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
const PORT = process.env.PORT || 4000; // Default to 3000 for local testing

// Function to generate a random 5-letter room ID
function generateRoomId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let roomId = '';
  for (let i = 0; i < 5; i++) {
    roomId += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return roomId;
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Log all events for debugging
  socket.onAny((event, ...args) => {
    console.log(`Event: ${event}, Args:`, args);
  });

  // Create a new room
  socket.on('createRoom', (playerName) => {
    const roomId = generateRoomId();
    rooms[roomId] = { players: [], impostor: null, votes: {} };

    // Add the player to the room
    rooms[roomId].players.push({ id: socket.id, name: playerName, role: 'crewmate' });

    // Notify the player of the room ID
    socket.emit('roomCreated', roomId);

    // Join the room
    socket.join(roomId);
    console.log(`Room ${roomId} created by ${playerName}`);
  });

  // Join an existing room
  socket.on('joinRoom', (roomId, playerName) => {
    if (rooms[roomId]) {
      // Add the player to the room
      rooms[roomId].players.push({ id: socket.id, name: playerName, role: 'crewmate' });

      // Notify all players in the room
      io.to(roomId).emit('updateRoom', { ...rooms[roomId], roomId });

      // Join the room
      socket.join(roomId);
      console.log(`${playerName} joined room ${roomId}`);
    } else {
      // Notify the player that the room doesn't exist
      socket.emit('serverError', 'Room not found');
      console.log(`Join failed: Room ${roomId} not found`);
    }
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
      console.log(`Game started in room ${roomId}`);
    } else {
      // Not enough players to start the game
      io.to(roomId).emit('serverError', 'Not enough players to start the game.');
      console.log(`Game start failed: Not enough players in room ${roomId}`);
    }
  });

  // Handle tasks and sabotages
  socket.on('completeTask', (roomId, taskId) => {
    const room = rooms[roomId];
    io.to(roomId).emit('taskCompleted', { playerId: socket.id, taskId });
    console.log(`Task ${taskId} completed by player ${socket.id} in room ${roomId}`);
  });

  socket.on('sabotage', (roomId) => {
    const room = rooms[roomId];
    if (socket.id === room.impostor) {
      io.to(roomId).emit('sabotageTriggered');
      console.log(`Sabotage triggered by impostor in room ${roomId}`);
    }
  });

  // Handle voting
  socket.on('callMeeting', (roomId) => {
    io.to(roomId).emit('meetingCalled', socket.id);
    console.log(`Meeting called by player ${socket.id} in room ${roomId}`);
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
      console.log(`Player ${ejectedPlayerId} ejected from room ${roomId}`);

      // Reset votes
      room.votes = {};
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
        console.log(`Room ${roomId} deleted`);
      } else {
        // Notify remaining players in the room
        io.to(roomId).emit('updateRoom', { ...rooms[roomId], roomId });
      }
    }
  });
});

// Start the server (Keep this one only)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
