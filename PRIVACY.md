# Privacy Policy

**chess.com --> Lichess** (Chrome extension)

Effective date: October 15, 2026

This extension lets you open your Chess.com games on Lichess for analysis. This policy explains what data it uses and where that data goes.

## Summary

- The extension does not have a server. The developer never receives any of your data.
- Your Chess.com username is stored only in your own browser.
- Your username is sent to Chess.com, and the game you choose is sent to Lichess, only to make the extension work.
- Nothing is sold, shared with advertisers, or used for tracking.

## Data the extension uses

**Your Chess.com username**
- You enter it in the extension's popup.
- It is saved in your browser's extension storage (`chrome.storage.local`) so you don't have to type it again. It stays on your device.
- It is sent to Chess.com's public API (`api.chess.com`) to get your list of games. This is the same public game data shown on your Chess.com profile.

**The game you choose to analyze**
- When you click "Analyze", the game's record (its PGN: player names, ratings, date, and moves) is sent to Lichess's import service (`lichess.org/api/import`).
- Lichess creates an analysis page for the game. Games imported to Lichess can be viewed by anyone who has the link.

**The current tab's address**
- When you open the popup, the extension checks the address of the tab you are on, to see if it is a Chess.com game page. If it is, the extension offers to analyze that game.
- The address is not stored or sent anywhere. The extension does not read or change the content of any web page.

## What the extension does not do

- It does not ask for or use any Chess.com or Lichess password or login.
- It does not collect browsing history, analytics, or tracking data.
- It does not sell or transfer your data to anyone, and does not use it for any purpose other than the one described above.

## Third parties

Data sent to Chess.com and Lichess is handled under their own privacy policies:

- Chess.com: https://www.chess.com/legal/privacy
- Lichess: https://lichess.org/privacy

## Deleting your data

To remove your saved username, uninstall the extension, or clear its data from your browser's extension settings. To delete a game imported to Lichess, see Lichess's own options and policies.

## Changes

If this policy changes, the updated version will be posted here with a new effective date.

## Contact

Questions? Open an issue at https://github.com/dklambert18/chess-analysis/issues
