// Shared Chess.com API helpers, used by the popup and the stats page.
const CHESS_API = 'https://api.chess.com/pub/player';
const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

async function getJson(url) {
  const response = await fetch(url);
  if (response.status === 404) throw new Error('Chess.com username was not found.');
  if (!response.ok) throw new Error(`Chess.com request failed (${response.status}).`);
  return response.json();
}

// Monthly archive URLs, newest month first.
async function fetchArchives(username) {
  const data = await getJson(`${CHESS_API}/${encodeURIComponent(username)}/games/archives`);
  return (data.archives || []).slice().reverse();
}

// One month's games, newest first.
async function fetchGames(archiveUrl) {
  const data = await getJson(archiveUrl);
  return (data.games || []).sort((a, b) => (b.end_time || 0) - (a.end_time || 0));
}

function monthLabel(archiveUrl) {
  const [year, month] = archiveUrl.split('/').slice(-2);
  return new Date(Number(year), Number(month) - 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

// Your color, your opponent, and 'win' | 'draw' | 'loss' from your side.
function describe(game, username) {
  const me = username.toLowerCase();
  const isWhite = game.white.username.toLowerCase() === me;
  const mine = isWhite ? game.white : game.black;
  const opponent = isWhite ? game.black : game.white;
  let outcome = 'loss';
  if (mine.result === 'win') outcome = 'win';
  else if (DRAW_RESULTS.has(mine.result)) outcome = 'draw';
  return { isWhite, mine, opponent, outcome };
}
