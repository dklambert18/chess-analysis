// Pure stats calculations over Chess.com game objects. No DOM access, so it
// can be tested in Node. Relies on describe() from chesscom.js.

// Words that end an opening's family name, e.g. "Sicilian Defense", "Italian Game".
const FAMILY_ENDINGS = new Set(['Defense', 'Opening', 'Game', 'Attack', 'Gambit', 'System', 'Countergambit']);
// Live games further apart than this count as separate sessions for the momentum stat.
const SESSION_GAP_SECONDS = 60 * 60;
const HOUR_BLOCKS = 8; // 3-hour blocks

function emptyRecord() {
  return { win: 0, draw: 0, loss: 0, games: 0 };
}

function add(record, outcome) {
  record[outcome] += 1;
  record.games += 1;
}

function winRate(record) {
  return record.games ? record.win / record.games : 0;
}

// "https://www.chess.com/openings/Sicilian-Defense-Open-Scheveningen...8.g5-Nfd7"
//   -> { family: "Sicilian Defense", variation: "Sicilian Defense Open Scheveningen" }
function openingNames(ecoUrl) {
  const slug = (ecoUrl || '').split('/openings/')[1];
  if (!slug || slug === 'Undefined') return { family: 'Unknown opening', variation: 'Unknown opening' };
  const words = [];
  for (const word of slug.split('-')) {
    if (/[\d.]/.test(word)) break; // move list starts, e.g. "2...Qa5" or "3.Nf3"
    words.push(word.replace(/^(Queens|Kings|Bishops|Alekhines|Petrovs)$/, (w) => `${w.slice(0, -1)}'s`));
  }
  // "Classical Variation" and "Classical" are the same line, so drop the trailing word.
  while (/^(with|and|of|the|in|Variation)$/.test(words.at(-1)) && words.length > 1) words.pop();
  if (!words.length) return { family: 'Unknown opening', variation: 'Unknown opening' };
  const end = words.findIndex((w) => FAMILY_ENDINGS.has(w));
  const family = words.slice(0, end === -1 ? Math.min(words.length, 3) : end + 1).join(' ');
  return { family, variation: words.join(' ') };
}

// When the game started, from the PGN's UTCDate/UTCTime headers; falls back to end time.
function startDate(game) {
  const date = game.pgn?.match(/\[UTCDate "(\d+)\.(\d+)\.(\d+)"\]/);
  const time = game.pgn?.match(/\[UTCTime "(\d+):(\d+):(\d+)"\]/);
  if (date && time) {
    return new Date(Date.UTC(+date[1], +date[2] - 1, +date[3], +time[1], +time[2], +time[3]));
  }
  return new Date(game.end_time * 1000);
}

// Chess.com sometimes drops the last word ("Caro Kann...3.e5" vs "Caro-Kann-Defense"),
// so fold "Caro Kann" into "Caro Kann Defense" when the full name also appears.
function mergeShortFamilies(byFamily, allNames) {
  for (const [name, entry] of [...byFamily.entries()]) {
    const lastWord = name.split(' ').at(-1);
    if (FAMILY_ENDINGS.has(lastWord)) continue;
    const fullName = [...FAMILY_ENDINGS].map((ending) => `${name} ${ending}`).find((n) => allNames.has(n));
    if (!fullName) continue;
    if (!byFamily.has(fullName)) byFamily.set(fullName, { record: emptyRecord(), variations: new Map() });
    const target = byFamily.get(fullName);
    for (const key of ['win', 'draw', 'loss', 'games']) target.record[key] += entry.record[key];
    for (const [variation, rec] of entry.variations) {
      const existing = target.variations.get(variation);
      if (existing) for (const key of ['win', 'draw', 'loss', 'games']) existing[key] += rec[key];
      else target.variations.set(variation, rec);
    }
    byFamily.delete(name);
  }
}

function openingTable(byFamily) {
  return [...byFamily.entries()]
    .map(([name, { record, variations }]) => ({
      name,
      record,
      variations: [...variations.entries()]
        .map(([variation, rec]) => ({ name: variation, record: rec }))
        .sort((a, b) => b.record.games - a.record.games),
    }))
    .sort((a, b) => b.record.games - a.record.games);
}

function computeStats(games, username) {
  const ordered = games.slice().sort((a, b) => a.end_time - b.end_time);
  const stats = {
    record: emptyRecord(),
    byColor: { white: emptyRecord(), black: emptyRecord() },
    byHourBlock: Array.from({ length: HOUR_BLOCKS }, emptyRecord),
    byWeekday: Array.from({ length: 7 }, emptyRecord), // Monday first
    momentum: { afterWin: emptyRecord(), afterLoss: emptyRecord() },
    streaks: { longestWin: 0, longestLoss: 0, current: { outcome: null, length: 0 } },
  };
  const openings = { white: new Map(), black: new Map() };

  let run = { outcome: null, length: 0 };
  let previous = null;
  for (const game of ordered) {
    const { isWhite, outcome } = describe(game, username);
    add(stats.record, outcome);
    add(stats.byColor[isWhite ? 'white' : 'black'], outcome);

    const { family, variation } = openingNames(game.eco);
    const families = openings[isWhite ? 'white' : 'black'];
    if (!families.has(family)) families.set(family, { record: emptyRecord(), variations: new Map() });
    const entry = families.get(family);
    add(entry.record, outcome);
    if (!entry.variations.has(variation)) entry.variations.set(variation, emptyRecord());
    add(entry.variations.get(variation), outcome);

    const start = startDate(game);
    add(stats.byHourBlock[Math.floor(start.getHours() / (24 / HOUR_BLOCKS))], outcome);
    add(stats.byWeekday[(start.getDay() + 6) % 7], outcome);

    // Momentum: how you do in the next live game after a win or a loss in the same session.
    if (previous && previous.outcome !== 'draw' && game.time_class !== 'daily' && previous.game.time_class !== 'daily'
      && game.end_time - previous.game.end_time <= SESSION_GAP_SECONDS) {
      add(stats.momentum[previous.outcome === 'win' ? 'afterWin' : 'afterLoss'], outcome);
    }
    previous = { game, outcome };

    // Streaks: a draw ends both win and loss streaks.
    run = outcome === run.outcome ? { outcome, length: run.length + 1 } : { outcome, length: 1 };
    if (outcome === 'win') stats.streaks.longestWin = Math.max(stats.streaks.longestWin, run.length);
    if (outcome === 'loss') stats.streaks.longestLoss = Math.max(stats.streaks.longestLoss, run.length);
  }
  stats.streaks.current = run;
  const allNames = new Set([...openings.white.keys(), ...openings.black.keys()]);
  mergeShortFamilies(openings.white, allNames);
  mergeShortFamilies(openings.black, allNames);
  stats.openings = { white: openingTable(openings.white), black: openingTable(openings.black) };
  return stats;
}

if (typeof module !== 'undefined') module.exports = { computeStats, openingNames, winRate, HOUR_BLOCKS };
