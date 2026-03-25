const socket = io();

const teamsEl = document.getElementById('teams');
const startBtn = document.getElementById('start-btn');
const joinLink = document.getElementById('join-link');
const qrCanvas = document.getElementById('qr');
const hostQuestion = document.getElementById('host-question');
const hostQTitle = document.getElementById('host-q-title');
const hostCountdown = document.getElementById('host-countdown');
const hostFinal = document.getElementById('host-final');
const hostPodium = document.getElementById('host-podium');
const hostStatus = document.getElementById('host-status');

socket.emit('host:register');

startBtn.onclick = () => socket.emit('host:startGame');

function renderTeams(teams) {
  teamsEl.innerHTML = '';
  teams.forEach((team) => {
    const div = document.createElement('div');
    div.className = 'team-card';
    div.innerHTML = `<strong>${team.name}</strong><br/>Jogadores: ${team.players}<br/>Pontos: ${team.score}`;
    teamsEl.appendChild(div);
  });
}

socket.on('host:ready', () => {
  const url = `${location.origin}/`;
  joinLink.textContent = url;
  QRCode.toCanvas(qrCanvas, url, { width: 180 });
});

socket.on('lobby:update', ({ teams }) => renderTeams(teams));
socket.on('host:updateTeams', ({ teams }) => renderTeams(teams));

socket.on('question:start', (q) => {
  hostQuestion.classList.remove('hidden');
  hostQuestion.hidden = false;
  hostFinal.classList.add('hidden');
  hostFinal.hidden = true;
  hostQTitle.textContent = `Pergunta ${q.index + 1}/${q.total}: ${q.text}`;

  const timer = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((q.durationMs - (Date.now() - q.startedAt)) / 1000));
    hostCountdown.textContent = `Tempo: ${remaining}s`;
    if (remaining <= 0) clearInterval(timer);
  }, 250);
});

socket.on('game:ended', ({ podium }) => {
  hostFinal.classList.remove('hidden');
  hostFinal.hidden = false;
  hostPodium.innerHTML = '';
  podium.forEach((team, idx) => {
    const li = document.createElement('li');
    li.textContent = `#${idx + 1} ${team.name} — média ${team.avg.toFixed(1)} (total ${team.total})`;
    hostPodium.appendChild(li);
  });
});

socket.on('connect', () => {
  hostStatus.textContent = 'Host ligado ✅';
});

socket.on('disconnect', () => {
  hostStatus.textContent = 'Host sem ligação. A tentar reconectar...';
});
