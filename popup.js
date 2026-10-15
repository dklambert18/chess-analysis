const CHESS_API = 'https://api.chess.com/pub/player';
const LICHESS_IMPORT = 'https://lichess.org/api/import';
// How many months back to look when finding the game open in the current tab.
const MAX_MONTHS_TO_SEARCH = 12;
const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

const usernameInput = document.getElementById('chessUsername');
const loadBtn = document.getElementById('loadBtn');
const monthSelect = document.getElementById('month');
const currentGameBtn = document.getElementById('currentGame');
const statusEl = document.getElementById('status');
const gamesList = document.getElementById('games');

let archives = [];
let currentTabGameId = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b00020' : '';
}

async function getJson(url) {
  const response = await fetch(url);
  if (response.status === 404) throw new Error('Chess.com username was not found.');
  if (!response.ok) throw new Error(`Chess.com request failed (${response.status}).`);
  return response.json();
}

function username() {
  return usernameInput.value.trim().toLowerCase();
}

async function fetchArchives() {
  const data = await getJson(`${CHESS_API}/${encodeURIComponent(username())}/games/archives`);
  // Newest month first.
  return (data.archives || []).slice().reverse();
}

async function fetchGames(archiveUrl) {
  const data = await getJson(archiveUrl);
  // Newest game first.
  return (data.games || []).sort((a, b) => (b.end_time || 0) - (a.end_time || 0));
}

function monthLabel(archiveUrl) {
  const [year, month] = archiveUrl.split('/').slice(-2);
  return new Date(Number(year), Number(month) - 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function describe(game) {
  const me = username();
  const isWhite = game.white.username.toLowerCase() === me;
  const mine = isWhite ? game.white : game.black;
  const opponent = isWhite ? game.black : game.white;
  let outcome = 'loss';
  if (mine.result === 'win') outcome = 'win';
  else if (DRAW_RESULTS.has(mine.result)) outcome = 'draw';
  return { isWhite, opponent, outcome };
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
  const { isWhite } = describe(game);
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
    const { opponent, outcome, isWhite } = describe(game);
    const li = document.createElement('li');

    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('div');
    name.className = 'opponent';
    name.textContent = `vs ${opponent.username} (${opponent.rating})`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const result = document.createElement('span');
    result.className = outcome;
    result.textContent = outcome.toUpperCase();
    const date = new Date(game.end_time * 1000).toLocaleDateString();
    meta.append(result, ` · ${isWhite ? 'White' : 'Black'} · ${game.time_class} · ${date}`);
    info.append(name, meta);

    const button = document.createElement('button');
    button.textContent = 'Analyze';
    button.addEventListener('click', () => analyze(game, button));

    li.append(info, button);
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
    archives = await fetchArchives();
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
