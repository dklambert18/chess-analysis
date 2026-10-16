// CHESS_API, getJson, fetchArchives, fetchGames, monthLabel and describe come from chesscom.js.
const LICHESS_IMPORT = 'https://lichess.org/api/import';
// How many months back to look when finding the game open in the current tab.
const MAX_MONTHS_TO_SEARCH = 12;

const usernameInput = document.getElementById('chessUsername');
const loadBtn = document.getElementById('loadBtn');
const statsBtn = document.getElementById('statsBtn');
const monthSelect = document.getElementById('month');
const currentGameBtn = document.getElementById('currentGame');
const statusEl = document.getElementById('status');
const gamesList = document.getElementById('games');

let archives = [];
let currentTabGameId = null;

const RESULT_LETTERS = { win: 'W', draw: 'D', loss: 'L' };

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function username() {
  return usernameInput.value.trim().toLowerCase();
}

async function importToLichess(game) {
  if (!game.pgn) throw new Error('This game has no PGN to import.');
  const response = await fetch(LICHESS_IMPORT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ pgn: game.pgn }),
  });
  if (response.status === 429) throw new Error('Lichess is rate limiting imports. Wait a minute and try again.');
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) throw new Error(data.error || `Lichess import failed (${response.status}).`);
  // Show the board from your side.
  const { isWhite } = describe(game, username());
  return isWhite ? data.url : `${data.url}/black`;
}

async function analyze(game, button) {
  if (button) button.disabled = true;
  setStatus('Importing to Lichess…');
  try {
    const url = await importToLichess(game);
    await chrome.tabs.create({ url });
    setStatus('Opened on Lichess. Click "Request a computer analysis" there for engine analysis.');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

function renderGames(games) {
  gamesList.replaceChildren();
  if (!games.length) {
    setStatus('No games this month.');
    return;
  }
  setStatus('');
  for (const game of games) {
    const { opponent, outcome, isWhite } = describe(game, username());
    const li = document.createElement('li');

    const result = document.createElement('div');
    result.className = 'result';
    result.style.setProperty('--swatch', `var(--${outcome})`);
    result.textContent = RESULT_LETTERS[outcome];
    result.title = outcome === 'win' ? 'Won' : outcome === 'loss' ? 'Lost' : 'Drawn';

    const info = document.createElement('div');
    info.style.minWidth = '0';
    const name = document.createElement('div');
    name.className = 'opponent';
    const rating = document.createElement('span');
    rating.className = 'rating';
    rating.textContent = opponent.rating;
    name.append(`vs ${opponent.username}`, rating);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const date = new Date(game.end_time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    meta.textContent = `${isWhite ? 'White' : 'Black'} · ${game.time_class} · ${date}`;
    info.append(name, meta);

    const button = document.createElement('button');
    button.className = 'text-btn';
    button.textContent = 'Analyze';
    button.addEventListener('click', () => analyze(game, button));

    li.append(result, info, button);
    gamesList.append(li);
  }
}

async function showMonth(archiveUrl) {
  setStatus('Loading games…');
  gamesList.replaceChildren();
  try {
    renderGames(await fetchGames(archiveUrl));
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function load() {
  if (!username()) {
    setStatus('Enter your Chess.com username.', true);
    return;
  }
  loadBtn.disabled = true;
  setStatus('Loading…');
  try {
    archives = await fetchArchives(username());
    await chrome.storage.local.set({ chessUsername: usernameInput.value.trim() });
    monthSelect.replaceChildren(...archives.map((url) => new Option(monthLabel(url), url)));
    monthSelect.disabled = !archives.length;
    currentGameBtn.style.display = currentTabGameId ? 'block' : 'none';
    if (!archives.length) {
      gamesList.replaceChildren();
      setStatus('No games found for this account.');
      return;
    }
    await showMonth(archives[0]);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    loadBtn.disabled = false;
  }
}

// Matches chess.com/game/live/123, /game/daily/123, /live/game/123, /analysis/game/live/123, /game/123.
function gameIdFromUrl(url) {
  const match = url && (url.match(/chess\.com\/.*?(?:live|daily)(?:\/game)?\/(\d+)/) || url.match(/chess\.com\/game\/(\d+)/));
  return match ? match[1] : null;
}

async function analyzeCurrentTabGame() {
  currentGameBtn.disabled = true;
  try {
    for (const archiveUrl of archives.slice(0, MAX_MONTHS_TO_SEARCH)) {
      setStatus(`Searching ${monthLabel(archiveUrl)}…`);
      const game = (await fetchGames(archiveUrl)).find((g) => g.url.endsWith(`/${currentTabGameId}`));
      if (game) {
        await analyze(game);
        return;
      }
    }
    setStatus(`That game isn't among ${usernameInput.value.trim()}'s games from the last ${MAX_MONTHS_TO_SEARCH} months. `
      + 'Pick it from the list instead.', true);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    currentGameBtn.disabled = false;
  }
}

loadBtn.addEventListener('click', load);
usernameInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') load(); });
monthSelect.addEventListener('change', () => showMonth(monthSelect.value));
currentGameBtn.addEventListener('click', analyzeCurrentTabGame);
statsBtn.addEventListener('click', async () => {
  if (username()) await chrome.storage.local.set({ chessUsername: usernameInput.value.trim() });
  chrome.tabs.create({ url: chrome.runtime.getURL('stats.html') });
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabGameId = gameIdFromUrl(tab?.url);
  const saved = await chrome.storage.local.get('chessUsername');
  if (saved.chessUsername) {
    usernameInput.value = saved.chessUsername;
    load();
  } else {
    usernameInput.focus();
  }
})();
