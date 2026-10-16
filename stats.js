// Stats page. Data helpers come from chesscom.js, calculations from stats-calc.js.
const MIN_GAMES = 5; // below this, a bar or row is marked as "few games"
const OPENINGS_SHOWN = 8;
const HOUR_LABELS = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p'];
const HOUR_NAMES = ['12am–3am', '3am–6am', '6am–9am', '9am–12pm', '12pm–3pm', '3pm–6pm', '6pm–9pm', '9pm–12am'];
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const RANGE_PHRASES = { 1: 'This month', 3: 'Over the last three months', 12: 'Over the last year', all: 'Since you joined' };
const RATING_KINDS = [['chess_bullet', 'Bullet'], ['chess_blitz', 'Blitz'], ['chess_rapid', 'Rapid'], ['chess_daily', 'Daily']];

const usernameInput = document.getElementById('username');
const statusEl = document.getElementById('status');
const dashboard = document.getElementById('dashboard');
const hero = document.getElementById('hero');
const tooltip = document.getElementById('tooltip');

const state = {
  username: '', archives: [], range: '3', timeClass: 'all',
  showAll: { white: false, black: false },
};
const monthCache = new Map(); // archive URL -> games
let loadToken = 0; // ignores results from a load that a newer one replaced
let lastGames = [];

// ---------- small helpers ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

// "You won **985** games" -> text with <b> for the starred parts.
function rich(tag, attrs, text) {
  const node = el(tag, attrs);
  text.split(/\*\*(.+?)\*\*/).forEach((part, i) => node.append(i % 2 ? el('b', {}, part) : part));
  return node;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

const fmt = (n) => n.toLocaleString();
const pct = (record) => `${Math.round(winRate(record) * 100)}%`;
const points = (a, b) => Math.round((winRate(a) - winRate(b)) * 100);
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const recordText = (r) => `${fmt(r.win)} won · ${fmt(r.draw)} drawn · ${fmt(r.loss)} lost`;

function tip(title, record) {
  return `${title}\n${pct(record)} won · ${plural(record.games, 'game')}\n${recordText(record)}`;
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

// ---------- building blocks ----------

function sectionHead(title, withLegend = false) {
  return el('div', { class: 'section-head' },
    el('h2', {}, title), el('div', { class: 'line' }),
    withLegend ? el('div', { class: 'legend' },
      el('span', { style: '--swatch: var(--win)' }, 'Won'),
      el('span', { style: '--swatch: var(--draw)' }, 'Drawn'),
      el('span', { style: '--swatch: var(--loss)' }, 'Lost')) : null);
}

function resultBar(record, title, thick = false) {
  const bar = el('div', { class: `rbar${thick ? ' thick' : ''}`, 'data-tip': tip(title, record), role: 'img', 'aria-label': `${title}: ${recordText(record)}` });
  for (const outcome of ['win', 'draw', 'loss']) {
    if (record[outcome]) bar.append(el('div', { class: `seg-${outcome}`, style: `flex: ${record[outcome]}` }));
  }
  return bar;
}

function dataTable(records, names) {
  return el('details', {}, el('summary', {}, 'Show as table'),
    el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, 'Games'), el('th', {}, 'Won'), el('th', {}, 'Drawn'), el('th', {}, 'Lost'), el('th', {}, 'Win rate'))),
      el('tbody', {}, ...records.map((r, i) => el('tr', {},
        el('td', {}, names[i]), el('td', {}, fmt(r.games)), el('td', {}, fmt(r.win)), el('td', {}, fmt(r.draw)),
        el('td', {}, fmt(r.loss)), el('td', {}, r.games ? pct(r) : '–'))))));
}

// Histogram of win rate. The best bin (with enough games) is highlighted and labeled.
function histogram(records, labels, names) {
  const eligible = records.map((r, i) => ({ r, i })).filter(({ r }) => r.games >= MIN_GAMES);
  const sorted = eligible.slice().sort((a, b) => winRate(b.r) - winRate(a.r));
  const best = sorted[0]?.i ?? -1;

  const hist = el('div', { class: 'hist' });
  records.forEach((record, i) => {
    const slot = el('div', { class: 'slot', 'data-tip': record.games ? tip(names[i], record) : `${names[i]}\nNo games` });
    if (record.games) {
      const height = Math.max(winRate(record) * 100, 1);
      const kind = record.games < MIN_GAMES ? ' few' : i === best ? ' top' : '';
      slot.append(el('div', { class: `bar${kind}`, style: `height: ${height}%` }));
      if (i === best) slot.append(el('div', { class: 'cap', style: `bottom: ${height}%` }, pct(record)));
    }
    hist.append(slot);
  });

  const wrap = el('div', {}, hist, el('div', { class: 'hist-labels' }, ...labels.map((l) => el('span', {}, l))));
  if (records.some((r) => r.games && r.games < MIN_GAMES)) {
    wrap.append(el('div', { class: 'note' }, `Striped bars have fewer than ${MIN_GAMES} games, so take them with a grain of salt.`));
  }
  wrap.append(dataTable(records, names));
  return { node: wrap, best: sorted[0], worst: sorted.at(-1), comparable: sorted.length >= 2 };
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

// ---------- sections ----------

function renderHero({ profile, ratings }) {
  const avatar = profile.avatar
    ? el('img', { class: 'avatar', src: profile.avatar, alt: '' })
    : el('img', { class: 'avatar pixel', src: 'icons/icon128.png', alt: '' });
  const meta = el('div', { class: 'meta' }, el('span', {}, `@${profile.username}`));
  if (profile.joined) meta.append(el('span', {}, `Joined ${new Date(profile.joined * 1000).getFullYear()}`));
  for (const [key, label] of RATING_KINDS) {
    const rating = ratings[key]?.last?.rating;
    if (rating) meta.append(rich('span', {}, `${label} **${rating}**`));
  }
  hero.replaceChildren(avatar, el('div', {},
    el('h1', {}, profile.title ? el('span', { class: 'title-badge' }, profile.title) : null, profile.name || profile.username),
    meta));
  hero.hidden = false;
}

function overview(stats) {
  const { record, streaks } = stats;
  const games = state.timeClass === 'all' ? 'games' : `${state.timeClass} games`;
  const current = streaks.current;
  const currentValue = current.outcome === 'win' ? current.length : 0;

  let lede = `${RANGE_PHRASES[state.range]} you played **${fmt(record.games)}** ${games}, won **${fmt(record.win)}** and lost **${fmt(record.loss)}**.`;
  if (streaks.longestWin >= 3) lede += ` Your best run was **${streaks.longestWin} wins in a row**.`;
  if (current.outcome === 'win' && current.length >= 2) lede += ` You're on a ${current.length}-game winning streak right now.`;
  if (current.outcome === 'loss' && current.length >= 3) lede += ` You've lost your last ${current.length}, so maybe take a breather.`;

  return el('div', {},
    el('div', { class: 'numbers' },
      number(fmt(record.games), state.timeClass === 'all' ? 'Games' : `${state.timeClass} games`),
      number(pct(record), 'Won'),
      number(String(streaks.longestWin), 'Longest win streak'),
      number(String(currentValue), 'Current win streak')),
    rich('p', { class: 'lede' }, lede));
}

function number(value, label) {
  return el('div', { class: 'number' }, el('div', { class: 'value' }, value), el('div', { class: 'label' }, label));
}

function colorsSection(stats) {
  const { white, black } = stats.byColor;
  const side = (name, record) => el('div', { class: 'side' },
    el('h3', {}, `With ${name}`),
    el('div', { class: 'big' }, pct(record), el('small', {}, 'won')),
    resultBar(record, `With ${name}`, true),
    el('div', { class: 'record' }, `${recordText(record)} · ${plural(record.games, 'game')}`));

  let prose = null;
  if (white.games >= MIN_GAMES && black.games >= MIN_GAMES) {
    const diff = points(white, black);
    prose = Math.abs(diff) < 3
      ? 'You win about as often with either color. Nicely balanced.'
      : `You win **${Math.abs(diff)} points more often with ${diff > 0 ? 'White' : 'Black'}**. Your ${diff > 0 ? 'Black' : 'White'} repertoire might be worth a look.`;
  }
  return el('section', {}, sectionHead('White & Black', true),
    el('div', { class: 'two' }, side('White', white), side('Black', black)),
    prose ? rich('p', { class: 'prose' }, prose) : null);
}

function openingList(color, families) {
  const shown = state.showAll[color] ? families : families.slice(0, OPENINGS_SHOWN);
  const column = el('div', {},
    el('h3', {}, `With ${color === 'white' ? 'White' : 'Black'}`),
    el('p', { class: 'sub' }, `${plural(families.length, 'opening')} · click one to see its lines`));
  if (!families.length) {
    column.append(el('p', { class: 'empty' }, `No games with ${color} in this range.`));
    return column;
  }

  const list = el('ol', { class: 'ranked' });
  shown.forEach((family, i) => {
    const variations = el('ul', { class: 'variations', hidden: '' }, ...family.variations.map((v) => el('li', {},
      el('div', {}, variationLabel(v.name, family.name), ' ', el('span', { class: 'count' }, `· ${v.record.games}`)),
      resultBar(v.record, v.name),
      el('div', { class: 'pct' }, pct(v.record)))));
    const few = family.record.games < MIN_GAMES;
    const row = el('div', { class: 'rank-row', role: 'button', tabindex: '0', 'aria-expanded': 'false' },
      el('div', { class: 'rank' }, String(i + 1)),
      el('div', {}, el('div', { class: 'name' }, family.name), el('div', { class: 'count' }, plural(family.record.games, 'game'))),
      resultBar(family.record, family.name),
      el('div', { class: `pct${few ? ' few' : ''}`, title: few ? `Only ${family.record.games} games` : '' }, pct(family.record)));
    const toggle = () => {
      variations.hidden = !variations.hidden;
      row.setAttribute('aria-expanded', String(!variations.hidden));
    };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
    list.append(el('li', {}, row, variations));
  });
  column.append(list);

  if (families.length > OPENINGS_SHOWN) {
    column.append(el('button', {
      class: 'link',
      onclick: () => { state.showAll[color] = !state.showAll[color]; render(); },
    }, state.showAll[color] ? 'Show fewer' : `All ${families.length} openings ↓`));
  }
  return column;
}

function openingsSection(stats) {
  // Best opening with a decent sample, across both colors.
  const candidates = [...stats.openings.white.map((o) => ({ ...o, color: 'White' })), ...stats.openings.black.map((o) => ({ ...o, color: 'Black' }))]
    .filter((o) => o.record.games >= 10);
  let prose = null;
  if (candidates.length >= 2) {
    const sorted = candidates.sort((a, b) => winRate(b.record) - winRate(a.record));
    const best = sorted[0];
    const worst = sorted.at(-1);
    prose = `Your best weapon is the **${best.name}** with ${best.color}, winning ${pct(best.record)} of ${best.record.games} games. `
      + `The **${worst.name}** with ${worst.color} is giving you the most trouble at ${pct(worst.record)}.`;
  }
  return el('section', {}, sectionHead('Openings', true),
    el('div', { class: 'two' }, openingList('white', stats.openings.white), openingList('black', stats.openings.black)),
    prose ? rich('p', { class: 'prose' }, prose) : null);
}

function whenSection(stats) {
  const hours = histogram(stats.byHourBlock, HOUR_LABELS, HOUR_NAMES);
  const days = histogram(stats.byWeekday, DAY_LABELS, DAY_NAMES);
  const sentences = [];
  if (hours.comparable && points(hours.best.r, hours.worst.r) >= 5) {
    sentences.push(`You're sharpest between **${HOUR_NAMES[hours.best.i]}** and shakiest between **${HOUR_NAMES[hours.worst.i]}**.`);
  }
  if (days.comparable && points(days.best.r, days.worst.r) >= 5) {
    sentences.push(`**${DAY_NAMES[days.best.i]}s** are your best day, and **${DAY_NAMES[days.worst.i]}s** your worst.`);
  }
  return el('section', {}, sectionHead('When you win'),
    el('div', { class: 'two' },
      el('div', {}, el('h3', {}, 'Time of day'), el('p', { class: 'sub' }, 'Win rate by start time, in your time zone'), hours.node),
      el('div', {}, el('h3', {}, 'Day of the week'), el('p', { class: 'sub' }, 'Win rate by day'), days.node)),
    sentences.length ? rich('p', { class: 'prose' }, sentences.join(' ')) : null);
}

function tiltSection(stats) {
  const { afterWin, afterLoss } = stats.momentum;
  let prose = 'Not enough back-to-back games yet. This looks at live games played within an hour of each other.';
  if (afterWin.games >= MIN_GAMES && afterLoss.games >= MIN_GAMES) {
    const diff = points(afterWin, afterLoss);
    if (diff >= 5) prose = `Right after a loss you win **${pct(afterLoss)}** of the time, **${diff} points lower** than after a win. A short break after a loss could save you some rating.`;
    else if (diff <= -5) prose = `Losses fire you up: right after one you win **${pct(afterLoss)}** of the time, **${-diff} points better** than after a win.`;
    else prose = `A loss barely affects your next game (**${pct(afterLoss)}** vs **${pct(afterWin)}** after a win). Ice in the veins.`;
  }
  const row = (label, record) => el('div', { class: 'tilt-row' },
    el('div', { class: 'label' }, label), resultBar(record, label, true), el('div', { class: 'pct' }, pct(record)));
  return el('section', {}, sectionHead('Tilt check', true),
    rich('p', { class: 'prose', style: 'margin: 0 0 20px' }, prose),
    row('After a win', afterWin), row('After a loss', afterLoss));
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

function render() {
  const games = lastGames.filter((g) => g.rules === 'chess' && (state.timeClass === 'all' || g.time_class === state.timeClass));
  dashboard.replaceChildren();
  if (!games.length) {
    dashboard.append(el('p', { class: 'lede' }, 'No games match these filters. Try a longer time range or a different time control.'));
    return;
  }
  const stats = computeStats(games, state.username);
  dashboard.append(overview(stats), colorsSection(stats), openingsSection(stats), whenSection(stats), tiltSection(stats));
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
  setStatus('');
  render();
}

async function loadUser(name) {
  state.username = name.trim();
  if (!state.username) {
    setStatus('Enter your Chess.com username.', true);
    return;
  }
  monthCache.clear();
  lastGames = [];
  dashboard.replaceChildren();
  hero.hidden = true;
  setStatus('Loading…');
  try {
    const [archives, profile] = await Promise.all([
      fetchArchives(state.username),
      fetchProfile(state.username).catch(() => null), // the header is nice to have, not required
    ]);
    state.archives = archives;
    if (profile) renderHero(profile);
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

function wireTabs(id, key, onChange) {
  const group = document.getElementById(id);
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    state[key] = button.dataset.value;
    onChange();
  });
}

wireTabs('rangeFilter', 'range', () => loadGames().catch((error) => setStatus(error.message, true)));
wireTabs('classFilter', 'timeClass', render);
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
