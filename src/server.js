const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// ── Game stores ───────────────────────────────────────────────
const connect4Games = new Map();
let nextC4Id = 1;

const memoryGames = new Map();
let nextMemoryId = 1;

const EMOJIS = [
  '🍎','🍊','🍋','🍇','🍓','🍑','🍒','🫐',
  '🥝','🍌','🍉','🍍','🥭','🍈','🍐','🍅',
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼',
  '🐨','🐯','🦁','🐮','🐷','🐸','🐵','🦄'
];

const generateJoinCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

const clampCardCount = (n) => {
  const valid = [8,16,24,32,40,48,56,64];
  return valid.reduce((a,b) => Math.abs(b-n) < Math.abs(a-n) ? b : a);
};

const createC4Game = () => {
  const id = nextC4Id++;
  const starter = Math.floor(Math.random() * 2) + 1;
  const game = {
    id, joinCode: generateJoinCode(),
    players: [null, null],
    board: Array.from({ length: 6 }, () => Array(7).fill(0)),
    currentPlayer: starter, status: 'waiting', winner: null, moveCount: 0, nextStarter: 0
  };
  connect4Games.set(id, game);
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

const createMemoryGame = (cardCount) => {
  const id = nextMemoryId++;
  const numPairs = cardCount / 2;
  const selected = EMOJIS.slice(0, numPairs);
  const cardEmojis = [];
  for (let i = 0; i < numPairs; i++) cardEmojis.push(selected[i], selected[i]);
  for (let i = cardEmojis.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cardEmojis[i], cardEmojis[j]] = [cardEmojis[j], cardEmojis[i]];
  }
  const board = cardEmojis.map((emoji, idx) => ({
    index: idx, pairId: Math.floor(idx / 2), emoji, state: 0
  }));
  const game = {
    id, joinCode: generateJoinCode(),
    players: [null, null],
    board, currentPlayer: 1, status: 'waiting',
    winner: null, moveCount: 0, matchedPairs: 0,
    totalPairs: numPairs, pendingFlip: null
  };
  memoryGames.set(id, game);
  return game;
};

// ── Routes: Health + Root ──────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.json({ status: 'ok', service: 'connect4-memory' }));

// ── Routes: Connect 4 ──────────────────────────────────────────

app.post('/api/game', (req, res) => {
  const g = createC4Game();
  res.json({ gameId: g.id, joinCode: g.joinCode, status: g.status, currentPlayer: g.currentPlayer, myPlayerNum: 1 });
});

app.post('/api/game/join', (req, res) => {
  const { joinCode, name } = req.body;
  if (!joinCode) return res.status(400).json({ error: 'joinCode required' });
  for (const g of connect4Games.values()) {
    if (g.joinCode === joinCode) {
      if (g.status !== 'waiting') return res.status(400).json({ error: 'Not waiting' });
      if (g.players[1] !== null) return res.status(400).json({ error: 'Full' });
      g.players[0] = g.players[0] || 'Player 1';
      g.players[1] = name || 'Player 2';
      g.status = 'active';
      return res.json({ gameId: g.id, joinCode: g.joinCode, status: g.status, currentPlayer: g.currentPlayer, myPlayerNum: 2 });
    }
  }
  res.status(404).json({ error: 'Not found' });
});

app.get('/api/game/:id', (req, res) => {
  const g = connect4Games.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.json({ id: g.id, joinCode: g.joinCode, players: g.players, board: g.board, currentPlayer: g.currentPlayer, status: g.status, winner: g.winner, moveCount: g.moveCount, nextStarter: g.nextStarter });
});

app.post('/api/game/:id/move', (req, res) => {
  const g = connect4Games.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.status !== 'active') return res.status(400).json({ error: 'Not active' });
  const col = Number(req.body.column);
  if (col < 0 || col > 6) return res.status(400).json({ error: 'Invalid column' });
  const pNum = g.currentPlayer, pIdx = pNum === 1 ? 0 : 1;
  if (g.players[pIdx] === null && req.body.playerName) g.players[pIdx] = req.body.playerName;
  if (g.players[pIdx] === null) return res.status(400).json({ error: 'Not joined' });
  let row = -1;
  for (let r = 5; r >= 0; r--) { if (g.board[r][col] === 0) { row = r; break; } }
  if (row === -1) return res.status(400).json({ error: 'Full' });
  g.board[row][col] = pNum;
  g.moveCount++;
  let winner = null;
  if (checkWin(g.board, pNum)) {
    g.status = 'finished'; g.winner = pNum; g.nextStarter = pNum === 1 ? 2 : 1;
    winner = g.players[pIdx];
  } else if (g.moveCount >= 42) {
    g.status = 'finished'; g.winner = 0; g.nextStarter = Math.floor(Math.random() * 2) + 1;
  } else {
    g.currentPlayer = g.currentPlayer === 1 ? 2 : 1;
  }
  res.json({ success: true, board: g.board, currentPlayer: g.currentPlayer, status: g.status, winner, nextStarter: g.nextStarter });
});

app.post('/api/game/:id/restart', (req, res) => {
  const g = connect4Games.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.status !== 'finished') return res.status(400).json({ error: 'Not finished' });
  const starter = g.nextStarter || (Math.floor(Math.random() * 2) + 1);
  g.board = Array.from({ length: 6 }, () => Array(7).fill(0));
  g.currentPlayer = starter; g.status = 'active'; g.winner = null; g.moveCount = 0; g.nextStarter = 0;
  res.json({ success: true, board: g.board, currentPlayer: g.currentPlayer, status: g.status });
});

app.delete('/api/game/:id', (req, res) => {
  connect4Games.delete(Number(req.params.id));
  memoryGames.delete(Number(req.params.id));
  res.json({ success: true });
});

// ── Routes: Memory ─────────────────────────────────────────────

app.post('/api/memory', (req, res) => {
  const cardCount = clampCardCount(req.body.cardCount || 16);
  const g = createMemoryGame(cardCount);
  res.json({ gameId: g.id, joinCode: g.joinCode, cardCount: g.cardCount, status: g.status, currentPlayer: g.currentPlayer, myPlayerNum: 1 });
});

app.post('/api/memory/join', (req, res) => {
  const { joinCode } = req.body;
  if (!joinCode) return res.status(400).json({ error: 'joinCode required' });
  for (const g of memoryGames.values()) {
    if (g.joinCode === joinCode) {
      if (g.status !== 'waiting') return res.status(400).json({ error: 'Not waiting' });
      if (g.players[1] !== null) return res.status(400).json({ error: 'Full' });
      g.players[0] = g.players[0] || 'Player 1';
      g.players[1] = 'Player 2';
      g.status = 'active';
      return res.json({ gameId: g.id, joinCode: g.joinCode, cardCount: g.cardCount, status: g.status, currentPlayer: g.currentPlayer, myPlayerNum: 2 });
    }
  }
  res.status(404).json({ error: 'Not found' });
});

app.get('/api/memory/:id', (req, res) => {
  const g = memoryGames.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: g.id, joinCode: g.joinCode, players: g.players,
    board: g.board.map(c => ({ index: c.index, pairId: c.pairId, emoji: c.emoji, state: c.state, matched: c.state === 2 })),
    currentPlayer: g.currentPlayer, status: g.status,
    winner: g.winner, moveCount: g.moveCount,
    matchedPairs: g.matchedPairs, totalPairs: g.totalPairs, cardCount: g.cardCount
  });
});

app.post('/api/memory/:id/flip', (req, res) => {
  const g = memoryGames.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.status !== 'active') return res.status(400).json({ error: 'Not active' });

  const cardIndex = Number(req.body.cardIndex);
  const playerNum = req.body.playerNum || g.currentPlayer;
  if (isNaN(cardIndex) || cardIndex < 0 || cardIndex >= g.board.length) return res.status(400).json({ error: 'Invalid card' });
  if (playerNum !== g.currentPlayer) return res.status(400).json({ error: 'Not your turn' });

  const pIdx = playerNum === 1 ? 0 : 1;
  if (g.players[pIdx] === null && req.body.playerName) g.players[pIdx] = req.body.playerName;
  if (g.players[pIdx] === null) return res.status(400).json({ error: 'Not joined' });

  const card = g.board[cardIndex];
  if (card.state !== 0) return res.status(400).json({ error: 'Card not face down' });

  card.state = 1;
  g.moveCount++;

  if (g.pendingFlip === null) {
    g.pendingFlip = { playerIdx, cardIndex };
    return res.json({ success: true, board: g.board, currentPlayer: g.currentPlayer, status: g.status, pending: true, moveCount: g.moveCount });
  }

  const pending = g.pendingFlip;
  g.pendingFlip = null;

  if (pending.cardIndex === cardIndex) {
    card.state = 0;
    g.moveCount--;
    return res.json({ success: false, board: g.board, currentPlayer: g.currentPlayer, status: g.status, error: 'Same card', moveCount: g.moveCount });
  }

  const pendingCard = g.board[pending.cardIndex];
  if (pendingCard.pairId === card.pairId) {
    pendingCard.state = 2;
    card.state = 2;
    g.matchedPairs++;
    if (g.matchedPairs >= g.totalPairs) {
      g.status = 'finished';
      g.winner = playerNum;
    }
    return res.json({ success: true, board: g.board, currentPlayer: g.currentPlayer, status: g.status, winner: g.winner, matched: true, matchedPairs: g.matchedPairs, totalPairs: g.totalPairs, moveCount: g.moveCount });
  }

  pendingCard.state = 0;
  card.state = 0;
  g.currentPlayer = g.currentPlayer === 1 ? 2 : 1;
  res.json({ success: true, board: g.board, currentPlayer: g.currentPlayer, status: g.status, matched: false, moveCount: g.moveCount });
});

app.post('/api/memory/:id/restart', (req, res) => {
  const g = memoryGames.get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Not found' });
  g.board.forEach(c => { c.state = 0; });
  g.currentPlayer = 1;
  g.status = 'active';
  g.winner = null;
  g.moveCount = 0;
  g.matchedPairs = 0;
  g.pendingFlip = null;
  res.json({ success: true, board: g.board.map(c => ({ index: c.index, pairId: c.pairId, emoji: c.emoji, state: c.state, matched: false })), currentPlayer: g.currentPlayer, status: g.status });
});

// ── WebSocket rejection ────────────────────────────────────────

server.on('upgrade', (req, socket, head) => {
  socket.write('HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nWebSocket not supported\r\n');
  socket.end();
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
