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

// Celebrity data
const celebrities = [
  { id: 1, name: "Lionel Messi", category: "Sports", image: "https://placehold.co/200x200?text=Messi" },
  { id: 2, name: "Scarlett Johansson", category: "Acting", image: "https://placehold.co/200x200?text=Scarlett" },
  { id: 3, name: "Taylor Swift", category: "Music", image: "https://placehold.co/200x200?text=Taylor" },
  // ... (17 more celebrities)
];

const rooms = {};

function generateRoomId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: 5 }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', (playerName) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      players: [],
      celebrities: [...celebrities],
      chosenCelebrities: {}, // Stores chosen cards by player ID
      eliminatedIds: [],
      currentTurn: null,
    };

    rooms[roomId].players.push({ id: socket.id, name: playerName });
    socket.join(roomId);
    socket.emit('roomCreated', { 
      roomId,
      celebrities: rooms[roomId].celebrities 
    });
  });

  socket.on('joinRoom', (roomId, playerName) => {
    const room = rooms[roomId];
    if (!room || room.players.length >= 2) return;

    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomId);

    io.to(roomId).emit('playerJoined', {
      players: room.players,
      celebrities: room.celebrities,
    });
  });

  socket.on('chooseCelebrity', (roomId, celebId) => {
    const room = rooms[roomId];
    room.chosenCelebrities[socket.id] = celebId;

    // Notify opponent that choice is made
    socket.to(roomId).emit('opponentChosen');

    // If both players have chosen, start the game
    if (Object.keys(room.chosenCelebrities).length === 2) {
      room.currentTurn = room.players[0].id; // First player's turn
      io.to(roomId).emit('gameStarted', { currentTurn: room.currentTurn });
    }
  });

  socket.on('askQuestion', (roomId, category) => {
    const room = rooms[roomId];
    const opponent = room.players.find(p => p.id !== socket.id);
    const opponentCelebrityId = room.chosenCelebrities[opponent.id];
    const opponentCelebrity = room.celebrities.find(c => c.id === opponentCelebrityId);

    const answer = opponentCelebrity.category === category;
    socket.emit('questionAnswered', { category, answer });

    if (!answer) {
      const toEliminate = room.celebrities
        .filter(c => c.category === category)
        .map(c => c.id);

      room.eliminatedIds.push(...toEliminate);
      io.to(roomId).emit('cardsEliminated', toEliminate);
    }

    room.currentTurn = opponent.id;
    io.to(roomId).emit('turnChanged', room.currentTurn);
  });

  socket.on('makeGuess', (roomId, guessedId) => {
    const room = rooms[roomId];
    const opponent = room.players.find(p => p.id !== socket.id);
    const isCorrect = room.chosenCelebrities[opponent.id] === guessedId;

    io.to(roomId).emit('guessResult', { 
      guesser: socket.id, 
      correct: isCorrect, 
      celebrity: room.celebrities.find(c => c.id === guessedId) 
    });

    if (isCorrect) {
      room.chosenCelebrities = {};
      room.eliminatedIds = [];
      room.currentTurn = null;
      io.to(roomId).emit('gameEnded', { winner: socket.id });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter(p => p.id !== socket.id);

      if (room.players.length === 0) delete rooms[roomId];
      else io.to(roomId).emit('playerLeft', socket.id);
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
