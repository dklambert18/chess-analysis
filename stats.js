// Stats dashboard. Data helpers come from chesscom.js, calculations from stats-calc.js.
const MIN_GAMES = 5; // below this, a column or row is marked as "few games"
const OPENINGS_SHOWN = 12;
const HOUR_LABELS = ['12–3a', '3–6a', '6–9a', '9a–12p', '12–3p', '3–6p', '6–9p', '9p–12a'];
const HOUR_NAMES = ['12am–3am', '3am–6am', '6am–9am', '9am–12pm', '12pm–3pm', '3pm–6pm', '6pm–9pm', '9pm–12am'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const usernameInput = document.getElementById('username');
const statusEl = document.getElementById('status');
const dashboard = document.getElementById('dashboard');
const titleEl = document.getElementById('title');
const tooltip = document.getElementById('tooltip');

const state = { username: '', archives: [], range: '3', timeClass: 'all', openingColor: 'white', showAllOpenings: false };
const monthCache = new Map(); // archive URL -> games
let loadToken = 0; // ignores results from a load that a newer one replaced

// ---------- small DOM helpers ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

const pct = (record) => `${Math.round(winRate(record) * 100)}%`;
const recordText = (r) => `${r.win} W · ${r.draw} D · ${r.loss} L`;
const gamesText = (n) => `${n} game${n === 1 ? '' : 's'}`;

function tip(title, record) {
  return `${title}\nWin rate ${pct(record)}\n${recordText(record)} (${gamesText(record.games)})`;
}

// ---------- tooltip ----------

document.addEventListener('pointermove', (event) => {
  const target = event.target.closest?.('[data-tip]');
  if (!target) {
    tooltip.style.display = 'none';
    return;
  }
  tooltip.textContent = target.dataset.tip;
  tooltip.style.display = 'block';
  const { width, height } = tooltip.getBoundingClientRect();
  const x = Math.min(event.clientX + 14, window.innerWidth - width - 8);
  const y = event.clientY + 16 + height > window.innerHeight ? event.clientY - height - 10 : event.clientY + 16;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
});
document.addEventListener('pointerleave', () => { tooltip.style.display = 'none'; });

// ---------- chart pieces ----------

function legend() {
  return el('div', { class: 'legend' },
    el('span', { style: '--swatch: var(--win)' }, 'Win'),
    el('span', { style: '--swatch: var(--draw)' }, 'Draw'),
    el('span', { style: '--swatch: var(--loss)' }, 'Loss'));
}

function resultBar(record, title, big = false) {
  const bar = el('div', { class: `rbar${big ? ' big' : ''}`, 'data-tip': tip(title, record), role: 'img', 'aria-label': `${title}: ${recordText(record)}` });
  for (const outcome of ['win', 'draw', 'loss']) {
    if (record[outcome]) bar.append(el('div', { class: `seg-${outcome}`, style: `flex: ${record[outcome]}` }));
  }
  return bar;
}

function resultRow(name, record) {
  return el('div', { class: 'color-row' },
    el('div', { class: 'name' }, name),
    resultBar(record, name, true),
    el('div', { class: 'pct' }, `${pct(record)} wins`, el('small', {}, recordText(record))));
}

// Single-series column chart of win rate. Only the best bin gets a value label.
function columnChart(records, labels, names) {
  const wrap = el('div');
  const cols = el('div', { class: 'cols' });
  for (const value of [0, 50, 100]) {
    cols.append(el('div', { class: 'gridline', style: `top: ${100 - value}%` }));
    cols.append(el('div', { class: 'tick', style: `top: ${100 - value}%` }, `${value}%`));
  }
  const eligible = records.map((r, i) => ({ r, i })).filter(({ r }) => r.games >= MIN_GAMES);
  const best = eligible.length ? eligible.reduce((a, b) => (winRate(b.r) > winRate(a.r) ? b : a)).i : -1;

  const bars = el('div', { class: 'bars' });
  records.forEach((record, i) => {
    const height = winRate(record) * 100;
    const slot = el('div', { class: 'slot', 'data-tip': record.games ? tip(names[i], record) : `${names[i]}\nNo games` });
    if (record.games) {
      slot.append(el('div', { class: `bar${record.games < MIN_GAMES ? ' few' : ''}`, style: `height: ${height}%` }));
      if (i === best) slot.append(el('div', { class: 'cap', style: `bottom: ${height}%` }, pct(record)));
    }
    bars.append(slot);
  });
  cols.append(bars);
  wrap.append(cols, el('div', { class: 'cols-labels' }, ...labels.map((l) => el('span', {}, l))));
  if (records.some((r) => r.games && r.games < MIN_GAMES)) {
    wrap.append(el('div', { class: 'few-note' }, `Fewer than ${MIN_GAMES} games, so less reliable`));
  }
  wrap.append(dataTable(records, names));
  return wrap;
}

function dataTable(records, names) {
  const body = el('tbody', {}, ...records.map((r, i) => el('tr', {},
    el('td', {}, names[i]), el('td', { class: 'num' }, String(r.games)),
    el('td', { class: 'num' }, recordText(r)), el('td', { class: 'num' }, r.games ? pct(r) : '–'))));
  return el('details', {}, el('summary', {}, 'Show as table'),
    el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', { class: 'num' }, 'Games'),
      el('th', { class: 'num' }, 'Record'), el('th', { class: 'num' }, 'Win rate'))), body));
}

function bestOf(records, names) {
  const eligible = records.map((r, i) => ({ r, name: names[i] })).filter(({ r }) => r.games >= MIN_GAMES);
  if (eligible.length < 2) return null;
  const sorted = eligible.sort((a, b) => winRate(b.r) - winRate(a.r));
  return { best: sorted[0], worst: sorted.at(-1) };
}

// ---------- sections ----------

function tile(label, value, note) {
  return el('div', { class: 'tile' }, el('div', { class: 'label' }, label), el('div', { class: 'value' }, value),
    note ? el('div', { class: 'note' }, note) : null);
}

const STREAK_WORDS = { win: ['win', 'wins'], loss: ['loss', 'losses'], draw: ['draw', 'draws'] };

function streakText(length, outcome) {
  if (!length) return 'None';
  const [one, many] = STREAK_WORDS[outcome];
  return `${length} ${length === 1 ? one : many}`;
}

function tilesSection(stats) {
  const { current, longestWin, longestLoss } = stats.streaks;
  return el('div', { class: 'tiles' },
    tile('Games', String(stats.record.games)),
    tile('Win rate', pct(stats.record), recordText(stats.record)),
    tile('Current streak', streakText(current.length, current.outcome)),
    tile('Longest win streak', streakText(longestWin, 'win')),
    tile('Longest losing streak', streakText(longestLoss, 'loss')));
}

function colorSection(stats) {
  const { white, black } = stats.byColor;
  let insight = null;
  if (white.games >= MIN_GAMES && black.games >= MIN_GAMES) {
    const diff = Math.round((winRate(white) - winRate(black)) * 100);
    insight = Math.abs(diff) < 3
      ? 'You do about equally well with both colors.'
      : `You win ${Math.abs(diff)} points more often as ${diff > 0 ? 'White' : 'Black'}.`;
  }
  return el('section', { class: 'card' },
    el('h2', {}, 'White vs Black'), el('p', { class: 'sub' }, 'Your results with each color'),
    legend(), resultRow('White', white), resultRow('Black', black),
    insight ? el('p', { class: 'insight' }, insight) : null);
}

// "Sicilian Defense Najdorf" under "Sicilian Defense" -> "Najdorf". Also handles merged
// short names, e.g. "Caro Kann Advance" under "Caro Kann Defense" -> "Advance".
function variationLabel(variation, family) {
  const prefixes = [family, family.split(' ').slice(0, -1).join(' ')].filter(Boolean);
  for (const prefix of prefixes) {
    if (variation === prefix) return 'Main line';
    if (variation.startsWith(`${prefix} `)) return variation.slice(prefix.length + 1);
  }
  return variation;
}

function openingsSection(stats) {
  const color = state.openingColor;
  const families = stats.openings[color];
  const shown = state.showAllOpenings ? families : families.slice(0, OPENINGS_SHOWN);

  const toggle = el('div', { class: 'seg', style: 'margin-bottom: 12px' },
    ...['white', 'black'].map((c) => el('button', {
      'aria-pressed': String(c === color),
      onclick: () => { state.openingColor = c; state.showAllOpenings = false; render(); },
    }, c === 'white' ? 'As White' : 'As Black')));

  const body = el('tbody');
  for (const family of shown) {
    const row = el('tr', { class: 'family', title: 'Click to see variations' },
      el('td', {}, family.name), el('td', { class: 'num' }, String(family.record.games)),
      el('td', { class: 'results' }, resultBar(family.record, family.name)),
      el('td', { class: 'num' }, family.record.games < MIN_GAMES ? `${pct(family.record)}*` : pct(family.record)));
    const variationRows = family.variations.map((v) => el('tr', { class: 'variation', hidden: '' },
      el('td', {}, variationLabel(v.name, family.name)), el('td', { class: 'num' }, String(v.record.games)),
      el('td', { class: 'results' }, resultBar(v.record, v.name)), el('td', { class: 'num' }, pct(v.record))));
    row.addEventListener('click', () => {
      const open = row.classList.toggle('open');
      variationRows.forEach((r) => { r.hidden = !open; });
    });
    body.append(row, ...variationRows);
  }

  const section = el('section', { class: 'card' },
    el('h2', {}, 'Openings'),
    el('p', { class: 'sub' }, 'Win rate by opening. Click an opening to see its variations. * fewer than 5 games'),
    toggle, legend());
  if (!families.length) {
    section.append(el('p', { class: 'empty' }, `No games as ${color} in this range.`));
    return section;
  }
  section.append(el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Opening'), el('th', { class: 'num' }, 'Games'),
      el('th', {}, 'Results'), el('th', { class: 'num' }, 'Win rate'))), body));
  if (families.length > OPENINGS_SHOWN) {
    section.append(el('button', {
      class: 'more',
      onclick: () => { state.showAllOpenings = !state.showAllOpenings; render(); },
    }, state.showAllOpenings ? 'Show fewer' : `Show all ${families.length} openings`));
  }
  return section;
}

function timeSection(title, sub, records, labels, names) {
  const extremes = bestOf(records, names);
  return el('section', { class: 'card' },
    el('h2', {}, title), el('p', { class: 'sub' }, sub),
    columnChart(records, labels, names),
    extremes && winRate(extremes.best.r) - winRate(extremes.worst.r) >= 0.05
      ? el('p', { class: 'insight' }, `Best: ${extremes.best.name} (${pct(extremes.best.r)}). Worst: ${extremes.worst.name} (${pct(extremes.worst.r)}).`)
      : null);
}

function momentumSection(stats) {
  const { afterWin, afterLoss } = stats.momentum;
  let insight = 'Not enough back-to-back games yet. This counts live games played within an hour of each other.';
  if (afterWin.games >= MIN_GAMES && afterLoss.games >= MIN_GAMES) {
    const diff = Math.round((winRate(afterWin) - winRate(afterLoss)) * 100);
    if (diff >= 5) insight = `You win ${diff} points less often right after a loss. Taking a short break after a loss might help.`;
    else if (diff <= -5) insight = `You actually do better right after a loss, by ${-diff} points. Losses seem to sharpen you up.`;
    else insight = 'A loss doesn\'t seem to affect your next game much. Nice and steady.';
  }
  return el('section', { class: 'card momentum' },
    el('h2', {}, 'Tilt check'), el('p', { class: 'sub' }, 'How you do in your next game, right after a win or a loss'),
    legend(), resultRow('After a win', afterWin), resultRow('After a loss', afterLoss),
    el('p', { class: 'insight' }, insight));
}

// ---------- loading & rendering ----------

function archivesInRange() {
  if (state.range === 'all') return state.archives;
  const now = new Date();
  const thisMonth = now.getFullYear() * 12 + now.getMonth();
  return state.archives.filter((url) => {
    const [year, month] = url.split('/').slice(-2).map(Number);
    return thisMonth - (year * 12 + month - 1) < Number(state.range);
  });
}

let lastGames = [];

function render() {
  const games = lastGames.filter((g) => g.rules === 'chess' && (state.timeClass === 'all' || g.time_class === state.timeClass));
  dashboard.replaceChildren();
  if (!games.length) {
    dashboard.append(el('p', { class: 'empty' }, 'No games match these filters. Try a longer time range or a different time control.'));
    return;
  }
  const stats = computeStats(games, state.username);
  dashboard.append(
    tilesSection(stats),
    colorSection(stats),
    openingsSection(stats),
    el('div', { class: 'grid2' },
      timeSection('Time of day', 'Win rate by when the game started, in your time zone', stats.byHourBlock, HOUR_LABELS, HOUR_NAMES),
      timeSection('Day of week', 'Win rate by day', stats.byWeekday, DAY_LABELS, DAY_NAMES)),
    momentumSection(stats));
}

async function loadGames() {
  const token = ++loadToken;
  const months = archivesInRange();
  const games = [];
  for (const [i, url] of months.entries()) {
    if (!monthCache.has(url)) {
      setStatus(`Loading ${monthLabel(url)} (${i + 1} of ${months.length})…`);
      monthCache.set(url, await fetchGames(url));
    }
    if (token !== loadToken) return; // a newer load started
    games.push(...monthCache.get(url));
  }
  lastGames = games;
  setStatus(months.length ? `${games.length} games from ${months.length} month${months.length === 1 ? '' : 's'}.` : '');
  render();
}

async function loadUser(name) {
  state.username = name.trim();
  if (!state.username) {
    setStatus('Enter your Chess.com username.', true);
    return;
  }
  titleEl.textContent = `${state.username}'s chess stats`;
  monthCache.clear();
  lastGames = [];
  dashboard.replaceChildren();
  setStatus('Loading…');
  try {
    state.archives = await fetchArchives(state.username);
    await chrome.storage.local.set({ chessUsername: state.username });
    if (!state.archives.length) {
      setStatus('No games found for this account.');
      return;
    }
    await loadGames();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function wireSegment(id, key, onChange) {
  const group = document.getElementById(id);
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    state[key] = button.dataset.value;
    onChange();
  });
}

wireSegment('rangeFilter', 'range', () => loadGames().catch((error) => setStatus(error.message, true)));
wireSegment('classFilter', 'timeClass', render);
document.getElementById('userForm').addEventListener('submit', (event) => {
  event.preventDefault();
  loadUser(usernameInput.value);
});

chrome.storage.local.get('chessUsername').then(({ chessUsername }) => {
  if (chessUsername) {
    usernameInput.value = chessUsername;
    loadUser(chessUsername);
  } else {
    usernameInput.focus();
  }
});
