import os
import time
import requests
import chess
import berserk
from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Allows your Chrome Extension popup to talk to localhost

load_dotenv()
API_TOKEN = os.getenv("API_TOKEN")
CHESS_USER = os.getenv("CHESS_USER")

session = berserk.TokenSession(API_TOKEN)
client = berserk.Client(session=session)

@app.route('/export', methods=['GET'])
def export_game():
    today = time.localtime()
    month = str(today.tm_mon).zfill(2)
    year = str(today.tm_year)

    url_path = f"https://api.chess.com/pub/player/{CHESS_USER}/games/{year}/{month}"
    headers = {"User-Agent": f"ChessMigratorApp/1.0 (contact: dklambert18@gmail.com)"}

    response = requests.get(url_path, headers=headers)
    if response.status_code != 200:
        return jsonify({"error": "Failed to fetch from Chess.com"}), 400

    games_list = response.json().get("games", [])
    if not games_list:
        return jsonify({"error": "No games found"}), 404

    latest_pgn = games_list[-1]["pgn"]

    try:
        # Import to Lichess via berserk
        imported_game = client.games.import_game(latest_pgn)
        game_url = imported_game.get("url")
        return jsonify({"url": game_url})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(port=5000)