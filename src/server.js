const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── Game store ───────────────────────────────────────────────────────
const games = new Map();
let gameIdCounter = 0;

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function createGame() {
  const id = ++gameIdCounter;
  const game = {
    id,
    joinCode: generateJoinCode(),
    players: [null, null],
    board: Array.from({ length: 6 }, () => Array(7).fill(0)),
    currentPlayer: 1,
    status: 'waiting',
    winner: null,
    moveCount: 0,
    created: Date.now()
  };
  games.set(id, game);
  return game;
}

function checkWin(board, piece) {
  for (let r = 0; r < 6; r++)
    for (let c = 0; c <= 3; c++)
      if (board[r][c] === piece && board[r][c+1] === piece && board[r][c+2] === piece && board[r][c+3] === piece) return true;
  for (let r = 0; r <= 2; r++)
    for (let c = 0; c < 7; c++)
      if (board[r][c] === piece && board[r+1][c] === piece && board[r+2][c] === piece && board[r+3][c] === piece) return true;
  for (let r = 0; r <= 2; r++)
    for (let c = 0; c <= 3; c++)
      if (board[r][c] === piece && board[r+1][c+1] === piece && board[r+2][c+2] === piece && board[r+3][c+3] === piece) return true;
  for (let r = 3; r <= 5; r++)
    for (let c = 0; c <= 3; c++)
      if (board[r][c] === piece && board[r-1][c+1] === piece && board[r-2][c+2] === piece && board[r-3][c+3] === piece) return true;
  return false;
}

// ── Routes ──────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/game', (req, res) => {
  const game = createGame();
  res.json({ gameId: game.id, joinCode: game.joinCode, status: game.status });
});

app.get('/api/game/:id', (req, res) => {
  const g = games.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: g.id, joinCode: g.joinCode, players: g.players,
    board: g.board, currentPlayer: g.currentPlayer,
    status: g.status, winner: g.winner, moveCount: g.moveCount
  });
});

app.post('/api/game/:id/join', (req, res) => {
  const g = games.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.status !== 'waiting') return res.status(400).json({ error: 'Game not waiting' });

  const name = req.body.playerName || 'Player';
  if (!g.players[0]) g.players[0] = name;
  else if (!g.players[1]) g.players[1] = name;
  else return res.status(400).json({ error: 'Game full' });

  if (g.players[1]) g.status = 'active';
  res.json({ id: g.id, joinCode: g.joinCode, players: g.players, status: g.status, currentPlayer: g.currentPlayer });
});

app.post('/api/game/:id/move', (req, res) => {
  const g = games.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.status !== 'active') return res.status(400).json({ error: 'Game not active' });

  const col = Number(req.body.column);
  const name = req.body.playerName;
  const slot = g.players.indexOf(name);
  if (slot === -1) return res.status(400).json({ error: 'Not in game' });

  const expected = slot === 0 ? 1 : 2;
  if (g.currentPlayer !== expected) return res.status(400).json({ error: 'Not your turn' });
  if (col < 0 || col > 6) return res.status(400).json({ error: 'Invalid column' });

  let row = -1;
  for (let r = 5; r >= 0; r--) if (g.board[r][col] === 0) { row = r; break; }
  if (row === -1) return res.status(400).json({ error: 'Column full' });

  g.board[row][col] = expected;
  g.moveCount++;

  if (checkWin(g.board, expected)) {
    g.status = 'finished';
    g.winner = name;
  } else if (g.moveCount >= 42) {
    g.status = 'finished';
    g.winner = null;
  } else {
    g.currentPlayer = g.currentPlayer === 1 ? 2 : 1;
  }

  res.json({ success: true, board: g.board, currentPlayer: g.currentPlayer, status: g.status, winner: g.winner });
});

app.delete('/api/game/:id', (req, res) => {
  games.delete(Number(req.params.id));
  res.json({ success: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
