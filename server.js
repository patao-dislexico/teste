const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const TEAM_COUNT = 5;
const QUESTION_TIME_MS = 30000;

const teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({
  id: `team-${i + 1}`,
  name: `Equipa ${i + 1}`,
  players: new Set(),
  score: 0,
}));

const questions = [
  {
    text: 'Qual é a capital de Portugal?',
    options: ['Lisboa', 'Porto', 'Coimbra', 'Faro'],
    correctIndex: 0,
  },
  {
    text: 'Quanto é 7 x 8?',
    options: ['54', '56', '64', '58'],
    correctIndex: 1,
  },
  {
    text: 'Qual linguagem roda no browser?',
    options: ['Python', 'C', 'JavaScript', 'Rust'],
    correctIndex: 2,
  },
  {
    text: 'Qual planeta é conhecido como planeta vermelho?',
    options: ['Vénus', 'Marte', 'Júpiter', 'Saturno'],
    correctIndex: 1,
  },
  {
    text: 'Quantos segundos tem 1 minuto?',
    options: ['100', '30', '90', '60'],
    correctIndex: 3,
  },
];

const players = new Map();
let hostSocketId = null;
let game = {
  started: false,
  questionIndex: -1,
  questionStartedAt: null,
  timer: null,
  answeredPlayers: new Set(),
};

function sanitizeTeamSnapshot() {
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    players: team.players.size,
    score: team.score,
  }));
}

function broadcastLobbyState() {
  io.emit('lobby:update', {
    teams: sanitizeTeamSnapshot(),
    started: game.started,
  });
}

function getQuestionPayload(index) {
  const q = questions[index];
  return {
    index,
    total: questions.length,
    text: q.text,
    options: q.options,
    durationMs: QUESTION_TIME_MS,
    startedAt: game.questionStartedAt,
  };
}

function clearGameTimer() {
  if (game.timer) {
    clearTimeout(game.timer);
    game.timer = null;
  }
}

function finishQuestion() {
  clearGameTimer();
  io.emit('question:ended', {
    teams: sanitizeTeamSnapshot(),
  });

  setTimeout(() => {
    game.questionIndex += 1;
    if (game.questionIndex >= questions.length) {
      game.started = false;
      const podium = teams
        .map((team) => ({
          id: team.id,
          name: team.name,
          avg: team.players.size ? team.score / team.players.size : 0,
          total: team.score,
          players: team.players.size,
        }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 3);

      io.emit('game:ended', {
        podium,
        teams: sanitizeTeamSnapshot(),
      });
      broadcastLobbyState();
      return;
    }

    game.answeredPlayers = new Set();
    game.questionStartedAt = Date.now();
    const payload = getQuestionPayload(game.questionIndex);
    io.emit('question:start', payload);
    game.timer = setTimeout(finishQuestion, QUESTION_TIME_MS);
  }, 3000);
}

function resetScores() {
  teams.forEach((team) => {
    team.score = 0;
  });
}

io.on('connection', (socket) => {
  socket.emit('lobby:update', {
    teams: sanitizeTeamSnapshot(),
    started: game.started,
  });

  socket.on('host:register', () => {
    hostSocketId = socket.id;
    socket.emit('host:ready', {
      teams: sanitizeTeamSnapshot(),
      questions: questions.length,
    });
  });

  socket.on('player:join', ({ username }) => {
    const name = String(username || '').trim().slice(0, 20);
    if (!name) {
      socket.emit('join:error', 'Nome inválido.');
      return;
    }

    players.set(socket.id, {
      username: name,
      teamId: null,
      score: 0,
    });

    socket.emit('join:success', {
      username: name,
      teams: sanitizeTeamSnapshot(),
    });

    broadcastLobbyState();
  });

  socket.on('player:chooseTeam', ({ teamId }) => {
    const player = players.get(socket.id);
    if (!player) return;
    const newTeam = teams.find((t) => t.id === teamId);
    if (!newTeam) return;

    if (player.teamId) {
      const current = teams.find((t) => t.id === player.teamId);
      current?.players.delete(socket.id);
    }

    newTeam.players.add(socket.id);
    player.teamId = newTeam.id;

    socket.emit('team:chosen', {
      teamId: newTeam.id,
      teamName: newTeam.name,
    });

    broadcastLobbyState();
  });

  socket.on('host:startGame', () => {
    if (socket.id !== hostSocketId || game.started) return;
    game.started = true;
    game.questionIndex = 0;
    game.answeredPlayers = new Set();
    game.questionStartedAt = Date.now();
    resetScores();
    players.forEach((p) => {
      p.score = 0;
    });

    io.emit('game:started');
    io.emit('question:start', getQuestionPayload(0));
    game.timer = setTimeout(finishQuestion, QUESTION_TIME_MS);
    broadcastLobbyState();
  });

  socket.on('player:answer', ({ questionIndex, optionIndex }) => {
    const player = players.get(socket.id);
    if (!player || !player.teamId || !game.started) return;
    if (questionIndex !== game.questionIndex) return;
    if (game.answeredPlayers.has(socket.id)) return;

    game.answeredPlayers.add(socket.id);

    const question = questions[game.questionIndex];
    const correct = question.correctIndex === optionIndex;
    let earned = 0;

    if (correct) {
      const elapsedMs = Date.now() - game.questionStartedAt;
      const normalized = Math.max(0, 1 - elapsedMs / QUESTION_TIME_MS);
      earned = Math.round(100 * normalized);
      player.score += earned;
      const team = teams.find((t) => t.id === player.teamId);
      if (team) {
        team.score += earned;
      }
    }

    socket.emit('answer:result', {
      correct,
      earned,
      totalScore: player.score,
    });

    if (socket.id === hostSocketId) {
      socket.emit('host:noop');
    }

    if (hostSocketId) {
      io.to(hostSocketId).emit('host:updateTeams', {
        teams: sanitizeTeamSnapshot(),
      });
    }
  });

  socket.on('disconnect', () => {
    if (socket.id === hostSocketId) {
      hostSocketId = null;
    }

    const player = players.get(socket.id);
    if (player) {
      const team = teams.find((t) => t.id === player.teamId);
      team?.players.delete(socket.id);
      players.delete(socket.id);
      broadcastLobbyState();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor pronto em http://localhost:${PORT}`);
});
