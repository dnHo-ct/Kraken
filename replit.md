# SENTINEL V2 – Institutional Market Analysis

## Overview
A trading analysis tool that generates structured prompts for AI-driven (ChatGPT/SENTINEL) institutional market audits. Users enter market data (Order Blocks, Fibonacci, Volume Profile, RSI/MACD/CVD) and the app constructs a formatted SENTINEL V2 prompt for AI analysis.

## Architecture
- **Frontend**: Single-page HTML app (`index.html`) with inline CSS and JavaScript
- **Backend**: Express.js server (`server.js`) serving static files and a stub `/analyze` API endpoint
- **Port**: 5000 (all interfaces: 0.0.0.0)

## Tech Stack
- Node.js 20
- Express.js (serves static HTML)
- Pure HTML/CSS/JavaScript frontend (no build step needed)
- CDN dependencies: Bootstrap 4.5.2, jQuery 3.5.1

## Key Files
- `index.html` — Main SENTINEL V2 UI (analysis mode, user data inputs, prompt output)
- `server.js` — Express server on port 5000
- `GettingStarted.textastic` — Original project template (kept for reference)
- `server.js.textastic` — Original server template (kept for reference)

## Running the App
```
node server.js
```
Server starts on `http://0.0.0.0:5000`

## Future Work
- Connect `/analyze` endpoint to OpenAI API for live AI analysis
- Add image upload support for multi-timeframe chart screenshots
