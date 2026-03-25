const socket = io();
let currentQuestion = null;
let timerInterval = null;

const joinView = document.getElementById('join-view');
const teamView = document.getElementById('team-view');
const questionView = document.getElementById('question-view');
const finalView = document.getElementById('final-view');

const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username');
const teamsEl = document.getElementById('teams');
const answersEl = document.getElementById('answers');
const questionTitle = document.getElementById('question-title');
const timerBar = document.getElementById('timer-bar');
const feedback = document.getElementById('answer-feedback');
const podium = document.getElementById('podium');

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

joinBtn.addEventListener('click', () => {
  socket.emit('player:join', { username: usernameInput.value });
});

socket.on('join:error', (msg) => alert(msg));

socket.on('join:success', ({ teams }) => {
  hide(joinView);
  show(teamView);
  renderTeams(teams);
});

socket.on('lobby:update', ({ teams, started }) => {
  if (!started && !teamView.classList.contains('hidden')) {
    renderTeams(teams);
  }
});

function renderTeams(teams) {
  teamsEl.innerHTML = '';
  teams.forEach((team) => {
    const card = document.createElement('button');
    card.className = 'team-card';
    card.innerHTML = `<strong>${team.name}</strong><br/>${team.players} jogadores`;
    card.onclick = () => socket.emit('player:chooseTeam', { teamId: team.id });
    teamsEl.appendChild(card);
  });
}

socket.on('team:chosen', ({ teamName }) => {
  feedback.textContent = `Entraste na ${teamName}. À espera do host...`;
});

socket.on('game:started', () => {
  hide(teamView);
  show(questionView);
  hide(finalView);
});

socket.on('question:start', (q) => {
  currentQuestion = q;
  feedback.textContent = '';
  questionTitle.textContent = `Pergunta ${q.index + 1}/${q.total}: ${q.text}`;
  answersEl.innerHTML = '';
  q.options.forEach((opt, index) => {
    const btn = document.createElement('button');
    btn.textContent = opt;
    btn.onclick = () => {
      socket.emit('player:answer', { questionIndex: q.index, optionIndex: index });
      [...answersEl.children].forEach((b) => (b.disabled = true));
    };
    answersEl.appendChild(btn);
  });

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - q.startedAt;
    const remaining = Math.max(0, q.durationMs - elapsed);
    timerBar.style.width = `${(remaining / q.durationMs) * 100}%`;
    if (remaining <= 0) clearInterval(timerInterval);
  }, 100);
});

socket.on('answer:result', ({ correct, earned, totalScore }) => {
  feedback.textContent = correct
    ? `✅ Correto! +${earned} pontos (total: ${totalScore})`
    : '❌ Errado.';
});

socket.on('game:ended', ({ podium: top }) => {
  hide(questionView);
  show(finalView);
  podium.innerHTML = '';
  top.forEach((team, idx) => {
    const li = document.createElement('li');
    li.textContent = `#${idx + 1} ${team.name} - média ${team.avg.toFixed(1)} (total ${team.total}, ${team.players} jogadores)`;
    podium.appendChild(li);
  });
});
