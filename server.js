const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Enhanced CORS configuration
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Store active rooms and players
const rooms = new Map();

// Render-compatible port configuration
const PORT = process.env.PORT || 10000; // Use Render's default port

// Generate random 5-character room ID
function generateRoomId() {
  return Math.random().toString(36).substr(2, 5).toUpperCase();
}

// Connection handler
io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);

  // Room creation handler
  socket.on('createRoom', (playerName) => {
    try {
      const roomId = generateRoomId();
      rooms.set(roomId, {
        players: new Map([[socket.id, { name: playerName, role: 'crewmate' }]]),
        impostor: null,
        votes: new Map()
      });

      socket.join(roomId);
      console.log(`🚪 Room created: ${roomId} by ${playerName}`);
      socket.emit('roomCreated', roomId);
      updateRoomState(roomId);

    } catch (error) {
      console.error('Room creation error:', error);
      socket.emit('serverError', 'Failed to create room');
    }
  });

  // Room joining handler
  // Join room handler
socket.on('joinRoom', ({ roomId, playerName }) => {
  if (!roomId || !playerName) {
    return socket.emit('serverError', 'Invalid join parameters');
  }
  
  if (rooms.has(roomId)) {
    const room = rooms.get(roomId);
    room.players.set(socket.id, { name: playerName, role: 'crewmate' });
    
    socket.join(roomId);
    console.log(`🎮 ${playerName} joined ${roomId}`);
    updateRoomState(roomId);
  } else {
    console.log(`🚫 Join failed: Room ${roomId} not found`);
    socket.emit('serverError', 'Room not found');
  }
});

  // Game start handler
  socket.on('startGame', (roomId) => {
    try {
      const room = rooms.get(roomId);
      if (room.players.size < 4) throw new Error('Need at least 4 players');
      
      const playersArray = Array.from(room.players);
      const impostor = playersArray[Math.floor(Math.random() * playersArray.length)];
      room.impostor = impostor[0];
      impostor[1].role = 'impostor';

      console.log(`🎲 Game started in ${roomId}`);
      io.to(roomId).emit('gameStarted', Array.from(room.players));
      
    } catch (error) {
      console.error('Start game error:', error.message);
      socket.emit('serverError', error.message);
    }
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    console.log(`⚠️ Disconnected: ${socket.id}`);
    rooms.forEach((room, roomId) => {
      if (room.players.delete(socket.id)) {
        if (room.players.size === 0) {
          rooms.delete(roomId);
          console.log(`🗑️ Room ${roomId} deleted`);
        } else {
          updateRoomState(roomId);
        }
      }
    });
  });

  // Update room state function
  const updateRoomState = (roomId) => {
    const room = rooms.get(roomId);
    io.to(roomId).emit('roomUpdate', {
      roomId,
      players: Array.from(room.players.values()),
      impostor: room.impostor
    });
  };
});

// Start server with error handling
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
}).on('error', (err) => {
  console.error('🔥 Server failed to start:', err);
  process.exit(1);
});