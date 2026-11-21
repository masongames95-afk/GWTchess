# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

«Королевские шахматы» is a Russian-language browser chess game. Players can play on one board, against the bot, or online by room code.

## Capabilities and Constraints

The existing application includes chess rules, move history, board flipping, sound, JSON game import/export, accounts, saved games, online rooms and player records. The interface uses vanilla HTML, CSS and JavaScript. Preserve those workflows when changing its presentation.

## Evidence on Hand

The detailed product and architecture record remains in [CONTEXT.md](CONTEXT.md); this file provides its compact design-workflow entry point. Current behavior is implemented in `index.html`, `js/app.js`, `js/bot.js`, `js/auth.js`, `js/online.js` and `js/leaderboard.js`. Existing chess-piece artwork lives in `assets/pieces/`.

The user-selected visual direction and reusable interface rules are recorded separately in `DESIGN.md`; surface-specific details live in `.impeccable/briefs/game.md`.
