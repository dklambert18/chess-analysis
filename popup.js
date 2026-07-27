document.getElementById('exportBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  statusEl.innerText = "Exporting...";

  try {
    const response = await fetch('http://localhost:5000/export');
    const data = await response.json();

    if (data.url) {
      statusEl.innerHTML = `<a href="${data.url}" target="_blank">Open on Lichess</a>`;
    } else {
      statusEl.innerText = "Error exporting game.";
    }
  } catch (err) {
    statusEl.innerText = "Failed to connect to main.py server.";
  }
});