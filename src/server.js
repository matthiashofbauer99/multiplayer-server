const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// ── Game store ────────────────────────────────────────────────
const games = new Map();
let nextId = 1;

const generateJoinCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

const createGame = () => {
  const id = nextId++;
  // Randomly decide who starts (1 = Red/creator, 2 = Yellow/joiner)
  const starter = Math.floor(Math.random() * 2) + 1;
  const game = {
    id, joinCode: generateJoinCode(),
    players: [null, null],
    board: Array.from({ length: 6 }, () => Array(7).fill(0)),
    currentPlayer: starter,
    status: 'waiting',
    winner: null,
    moveCount: 0,
    nextStarter: 0
  };
  games.set(id, game);
  return game;
};

const checkWin = (board, piece) => {
  for (let r = 0; r < 6; r++)
    for (let c = 0; c <= 3; c++)
      if (board[r][c] === piece && board[r][c+1] === piece && board[r][c+2] === piece && board[r][c+3] === piece) return true;
  for (let r = 0; r <= 2; r++)
    for (let c = 0; c < 7; c++)
      if (board[r][c] === piece && board[r+1][c] === piece && board[r+2][c] === piece && board[r+3][c] === piece) return true;
  for (let r = 0; r <= 2; r++)
    for (let c = 0; c <= 3; c++)
      if (board[r][c] === piece && board[r+1][c+1] === piece && board[r+2][c+2] === piece && board[r+3][c+3] === piece) return true;
  for (let r = 3; r < 6; r++)
    for (let c = 0; c <= 3; c++)
      if (board[r][c] === piece && board[r-1][c+1] === piece && board[r-2][c+2] === piece && board[r-3][c+3] === piece) return true;
  return false;
};

// ── Routes ────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/', (req, res) => res.json({ status: 'ok', service: 'connect4-multiplayer' }));

// Create game — creator gets Player 1 (Red)
app.post('/api/game', (req, res) => {
  const game = createGame();
  res.json({ gameId: game.id, joinCode: game.joinCode, status: game.status, currentPlayer: game.currentPlayer, myPlayerNum: 1 });
});

// Join by code — joiner becomes Player 2 (Yellow)
app.post('/api/game/join', (req, res) => {
  const { joinCode, name } = req.body;
  if (!joinCode) return res.status(400).json({ error: 'joinCode required' });

  for (const g of games.values()) {
    if (g.joinCode === joinCode) {
      if (g.status !== 'waiting') return res.status(400).json({ error: 'Game not waiting' });
      if (g.players[1] !== null) return res.status(400).json({ error: 'Game full' });

      g.players[0] = g.players[0] || 'Player 1';
      g.players[1] = name || 'Player 2';
      g.status = 'active';

      return res.json({
        gameId: g.id, joinCode: g.joinCode, status: g.status,
        currentPlayer: g.currentPlayer, myPlayerNum: 2
      });
    }
  }
  res.status(404).json({ error: 'Game not found' });
});

// Poll game state
app.get('/api/game/:id', (req, res) => {
  const g = games.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: g.id, joinCode: g.joinCode, players: g.players,
    board: g.board, currentPlayer: g.currentPlayer,
    status: g.status, winner: g.winner, moveCount: g.moveCount,
    nextStarter: g.nextStarter
  });
});

// Make a move
app.post('/api/game/:id/move', (req, res) => {
  const g = games.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.status !== 'active') return res.status(400).json({ error: 'Game not active' });

  const col = Number(req.body.column);
  if (col < 0 || col > 6) return res.status(400).json({ error: 'Invalid column' });

  const playerNum = g.currentPlayer;
  const playerIdx = playerNum === 1 ? 0 : 1;

  if (g.players[playerIdx] === null && req.body.playerName) {
    g.players[playerIdx] = req.body.playerName;
  }
  if (g.players[playerIdx] === null) return res.status(400).json({ error: 'Player not joined' });

  let row = -1;
  for (let r = 5; r >= 0; r--) {
    if (g.board[r][col] === 0) { row = r; break; }
  }
  if (row === -1) return res.status(400).json({ error: 'Column full' });

  g.board[row][col] = playerNum;
  g.moveCount++;

  let winner = null;
  if (checkWin(g.board, playerNum)) {
    g.status = 'finished';
    g.winner = playerNum;
    g.nextStarter = playerNum === 1 ? 2 : 1;
    winner = g.players[playerIdx];
  } else if (g.moveCount >= 42) {
    g.status = 'finished';
    g.winner = 0;
    g.nextStarter = Math.floor(Math.random() * 2) + 1;
  } else {
    g.currentPlayer = g.currentPlayer === 1 ? 2 : 1;
  }

  res.json({
    success: true, board: g.board, currentPlayer: g.currentPlayer,
    status: g.status, winner, nextStarter: g.nextStarter
  });
});

// Restart / rematch — loser starts, board clears
app.post('/api/game/:id/restart', (req, res) => {
  const g = games.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.status !== 'finished') return res.status(400).json({ error: 'Game not finished' });

  const starter = g.nextStarter || (Math.floor(Math.random() * 2) + 1);
  g.board = Array.from({ length: 6 }, () => Array(7).fill(0));
  g.currentPlayer = starter;
  g.status = 'active';
  g.winner = null;
  g.moveCount = 0;
  g.nextStarter = 0;

  res.json({
    success: true, board: g.board, currentPlayer: g.currentPlayer,
    status: g.status, nextStarter: g.nextStarter
  });
});

// Delete game
app.delete('/api/game/:id', (req, res) => {
  games.delete(Number(req.params.id));
  res.json({ success: true });
});

// Reject WebSocket upgrades
server.on('upgrade', (req, socket, head) => {
  socket.write('HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nWebSocket not supported\r\n');
  socket.end();
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
