import os
import json
import chess
import berserk
import requests
from dotenv import load_dotenv

# Load Lichess API Token from .env
load_dotenv()
API_TOKEN = os.getenv("API_TOKEN")
CHESS_USER = os.getenv("CHESS_USER")

# Set up the Lichess client
session = berserk.TokenSession(API_TOKEN)
client = berserk.Client(session=session)

# User Inputs
year = input("Please input the year (e.g., 2026): ").strip()
month = input("Please input the month (e.g., 06 or 6): ").strip().zfill(2)  # Ensures 2 digits

# Endpoint construction
url_path = f"https://api.chess.com/pub/player/{CHESS_USER}/games/{year}/{month}"

# Headers strictly require "User-Agent"
headers = {
    "User-Agent": f"ChessMigratorApp/1.0 (contact: dklambert18@gmail.com)"
}

if __name__ == "__main__":
    print(f"Fetching games from: {url_path}...")
    response = requests.get(url_path, headers=headers)
    if response.status_code == 200:
        games_data = response.json()
        games_list = games_data.get("games", [])
        print(f"Successfully retrieved {len(games_list)} games!")
    else:
        print(f"Request failed with status code: {response.status_code}")
    counter = 0
    game = games_data[len(games_data)]
    try:
        game_id, imported_game_url = client.games.import_game(game["pgn"])
    except Exception as e:
        print(str(counter))
        print(f"failed to import{game["url"]}")
        print(e.args[0])

    