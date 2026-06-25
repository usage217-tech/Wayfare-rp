// ---------- State ----------
const state = {
  apiKey: '',
  userName: '',
  userPronouns: 'they/them',
  userBio: '',
  character: null,
  scene: null,
  tone: 'balanced',
  history: [] // {role: 'user'|'assistant', content}
};

const STEP_ORDER = ['settings', 'profile', 'character', 'environment', 'chat'];

// ---------- Navigation ----------
function goToStep(stepName) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  document.querySelector(`[data-screen="${stepName}"]`).classList.add('is-active');

  const idx = STEP_ORDER.indexOf(stepName);
  document.querySelectorAll('.thread-step').forEach((el, i) => {
    el.classList.remove('is-active', 'is-done');
    if (i < idx) el.classList.add('is-done');
    if (i === idx) el.classList.add('is-active');
  });
  const fillPct = ((idx + 1) / STEP_ORDER.length) * 100;
  document.getElementById('threadFill').style.width = fillPct + '%';

  window.scrollTo(0, 0);
}

function currentStep() {
  return document.querySelector('.screen.is-active').dataset.screen;
}

document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => {
    const idx = STEP_ORDER.indexOf(currentStep());
    if (idx > 0) goToStep(STEP_ORDER[idx - 1]);
  });
});

// ---------- Step 1: Settings ----------
const apiKeyInput = document.getElementById('apiKey');
const toggleKeyBtn = document.getElementById('toggleKeyVisibility');

// Load saved key if present
try {
  const saved = localStorage.getItem('wayfare_api_key');
  if (saved) {
    apiKeyInput.value = saved;
    state.apiKey = saved;
  }
} catch (e) { /* localStorage unavailable, continue without persistence */ }

toggleKeyBtn.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleKeyBtn.textContent = isPassword ? 'Hide key' : 'Show key';
});

document.getElementById('settingsNext').addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  const errorEl = document.getElementById('settingsError');
  if (!key) {
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;
  state.apiKey = key;
  try { localStorage.setItem('wayfare_api_key', key); } catch (e) { /* ignore */ }
  goToStep('profile');
});

// ---------- Step 2: Profile ----------
document.getElementById('profileNext').addEventListener('click', () => {
  state.userName = document.getElementById('userName').value.trim() || 'Traveler';
  state.userPronouns = document.getElementById('userPronouns').value;
  state.userBio = document.getElementById('userBio').value.trim();
  renderCharacterGrid();
  goToStep('character');
});

// ---------- Step 3: Character select ----------
const characterGrid = document.getElementById('characterGrid');
let activeFilter = 'all';

document.getElementById('genderFilter').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  document.querySelectorAll('#genderFilter .chip').forEach(c => c.classList.remove('is-active'));
  btn.classList.add('is-active');
  activeFilter = btn.dataset.filter;
  renderCharacterGrid();
});

function renderCharacterGrid() {
  characterGrid.innerHTML = '';
  const list = CHARACTERS.filter(c => activeFilter === 'all' || c.gender === activeFilter);
  list.forEach(char => {
    const card = document.createElement('button');
    card.className = 'character-card';
    card.type = 'button';
    if (state.character && state.character.id === char.id) card.classList.add('is-selected');
    card.innerHTML = `
      <img src="${char.avatar}" alt="${char.name}">
      <h3>${char.name}</h3>
      <p>${char.tagline}</p>
    `;
    card.addEventListener('click', () => {
      state.character = char;
      renderCharacterGrid();
      renderSceneList();
      document.getElementById('envCharName').textContent = char.name;
      document.getElementById('envCharDesc').textContent = char.voice;
      goToStep('environment');
    });
    characterGrid.appendChild(card);
  });
}

// ---------- Step 4: Environment / scene select ----------
const sceneList = document.getElementById('sceneList');
const envNextBtn = document.getElementById('envNext');

function renderSceneList() {
  sceneList.innerHTML = '';
  state.scene = null;
  envNextBtn.disabled = true;
  state.character.scenes.forEach(scene => {
    const card = document.createElement('button');
    card.className = 'scene-card';
    card.type = 'button';
    card.innerHTML = `
      <p class="scene-setting">${scene.setting}</p>
      <h3>${scene.label}</h3>
      <p class="scene-narrative">${scene.narrative}</p>
    `;
    card.addEventListener('click', () => {
      state.scene = scene;
      document.querySelectorAll('.scene-card').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      envNextBtn.disabled = false;
    });
    sceneList.appendChild(card);
  });
}

document.getElementById('sceneTone').addEventListener('change', (e) => {
  state.tone = e.target.value;
});

envNextBtn.addEventListener('click', () => {
  startChat();
  goToStep('chat');
});

// ---------- Step 5: Chat ----------
const chatLog = document.getElementById('chatLog');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

document.getElementById('chatBack').addEventListener('click', () => goToStep('environment'));
document.getElementById('chatRestart').addEventListener('click', () => {
  if (confirm('Restart this story from the beginning?')) {
    startChat();
  }
});

function toneInstruction(tone) {
  switch (tone) {
    case 'lighter': return ' Keep the tone light, warm, and easygoing.';
    case 'tense': return ' Lean into tension, mystery, and stakes.';
    case 'slow': return ' Take your time — favor a slow-burn pace, small details, patience.';
    default: return '';
  }
}

function buildSystemPrompt() {
  const c = state.character;
  const userDesc = state.userBio
    ? `The user, ${state.userName} (${state.userPronouns}), describes themself as: ${state.userBio}.`
    : `The user goes by ${state.userName} (${state.userPronouns}).`;

  return `${c.systemPrompt}

Setting: ${state.scene.setting}. ${state.scene.narrative}
${userDesc}${toneInstruction(state.tone)}

Stay fully in character as ${c.name} at all times. Write engaging, grounded responses appropriate for a general audience — no explicit sexual content, no graphic violence, no real-world harmful instructions. This is a friendly, PG-13 narrative roleplay. Respond only as ${c.name}, never as narrator unless it's a brief scene-setting beat.`;
}

function startChat() {
  state.history = [];
  chatLog.innerHTML = '';
  document.getElementById('chatAvatar').src = state.character.avatar;
  document.getElementById('chatCharName').textContent = state.character.name;
  document.getElementById('chatSceneName').textContent = state.scene.label;

  appendNarrative(state.scene.narrative);
  appendMessage('char', state.scene.opener);
  state.history.push({ role: 'assistant', content: state.scene.opener });
}

function appendMessage(who, text) {
  const div = document.createElement('div');
  div.className = `msg from-${who === 'char' ? 'char' : 'user'}`;
  div.innerHTML = formatMessage(text);
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function appendNarrative(text) {
  const div = document.createElement('div');
  div.className = 'msg from-narrative';
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function formatMessage(text) {
  // Escape HTML then convert *actions* to italics
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'msg from-char is-typing';
  div.id = 'typingIndicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  appendMessage('user', text);
  state.history.push({ role: 'user', content: text });
  chatInput.value = '';
  chatInput.style.height = 'auto';

  const sendBtn = chatForm.querySelector('.send-btn');
  sendBtn.disabled = true;
  showTyping();

  try {
    const reply = await callMistral();
    hideTyping();
    appendMessage('char', reply);
    state.history.push({ role: 'assistant', content: reply });
  } catch (err) {
    hideTyping();
    appendNarrative(`Something went wrong reaching the story engine: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
  }
});

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

async function callMistral() {
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...state.history
  ];

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.apiKey}`
    },
    body: JSON.stringify({
      model: 'mistral-large-latest',
      messages,
      temperature: 0.8,
      max_tokens: 350
    })
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    if (response.status === 401) throw new Error('That API key was rejected. Check it in settings.');
    throw new Error(`Request failed (${response.status}). ${errBody.slice(0, 120)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('No reply came back from the story engine.');
  return content.trim();
}
