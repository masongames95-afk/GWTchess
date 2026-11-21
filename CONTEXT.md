# Chess in Browser (FIDE-compliant Engine + JSON DB Authentication & Online Multiplayer)

## 1. Project Overview & Architecture
Full-stack browser-based chess game featuring FIDE-compliant rules, open-source PNG piece aesthetics, and a lightweight zero-dependency Node.js server with a JSON file database for user registration, authentication, live account checking, cloud state persistence, online multiplayer between authenticated users, and persistent game history recording.

- **Frontend Target**: Pure vanilla JavaScript (`js/engine.js`, `js/app.js`, `js/auth.js`, `js/online.js`) with responsive CSS3.
- **Backend & Database**:
  - Zero-dependency Node.js HTTP server (`server.js`) on port 3000.
  - In-memory online multiplayer room manager (`src/rooms.js`) with Server-Sent Events (SSE) real-time event streaming (`/api/rooms/:code/events`).
  - Authoritative server-side chess rule validation using `js/engine.js`.
  - JSON file-based database (`data/users_db.json`) via `src/db.js` with atomic file writes to prevent race conditions.
  - Cryptographically secure password hashing using `node:crypto` (`scryptSync` with unique random salt per user).
  - Constant-time password validation (`timingSafeEqual`) against timing attacks.
  - Cryptographically generated session tokens (32 bytes hex) sent via `Set-Cookie: session_id=...; HttpOnly; SameSite=Lax` and Bearer Authorization headers.
- **Core Engine**: Pure vanilla JavaScript (`js/engine.js`) providing complete FIDE rules implementation:
  - Strict legal move generation (pins, discovered attacks, double checks).
  - King safety validation (`isSquareAttacked`, `isKingInCheck`).
  - Castling (Kingside & Queenside, with transit/destination attack checks).
  - En Passant (with strict 1-move validity expiration).
  - Pawn Promotion (Queen, Rook, Bishop, Knight choices).
  - Check (`+`), Checkmate (`#`), and Stalemate game-over detection.
  - Standard Algebraic Notation (SAN) generation.
- **Authentication & Database API**:
  - `GET /api/auth/check-username?username=...`: Real-time username availability check (returns `{ exists: boolean, valid: boolean, message: string }`).
  - `POST /api/auth/register`: User registration with duplicate detection, salt generation, password hashing, and session initialization.
  - `POST /api/auth/login`: User authentication with distinct feedback if the account does not exist (`USER_NOT_FOUND`) vs wrong password (`INVALID_PASSWORD`).
  - `GET /api/auth/me`: Session status and current user profile retrieval.
  - `POST /api/auth/logout`: Session termination and cookie invalidation.
  - `POST /api/user/save-game`: Persist active game state to the user's account in the JSON database.
  - `GET /api/user/load-game`: Load user's saved game from the JSON database.
  - `POST /api/user/record-result`: Update wins/losses/draws stats in the JSON database upon checkmate/stalemate.
  - `GET /api/user/games`: Retrieve current user's match history and complete statistics.
  - `POST /api/user/record-game`: Record finished local or custom game into profile history.
- **Leaderboard & Hall of Fame API**:
  - `GET /api/leaderboard`: Retrieves rankings across all registered accounts:
    - `fastestMates`: Top accounts sorted by fewest half-moves / full moves to deliver checkmate (`movesCount` ASC).
    - `mostWins`: Top accounts sorted by total victories (`stats.wins` DESC).
    - `bestWinrate`: Top accounts sorted by winrate percentage (`winrate` DESC for accounts with $\ge 1$ games).
    - `mostActive`: Top accounts sorted by total games played (`stats.total` DESC).
    - `userRank`: Optional personal ranking and best record for authenticated session user.
- **Online Multiplayer Rooms API (`src/rooms.js`)**:
  - `POST /api/rooms/create`: Generates unique 6-character room code (e.g. `K9X2B4`), sets creator as White, initial chess state.
  - `POST /api/rooms/join`: Allows another authenticated user to join by room code as Black; triggers match start.
  - `GET /api/rooms/:code`: Retrieves public room state and participant details.
  - `GET /api/rooms/:code/events`: Native Server-Sent Events (SSE) stream for real-time move delivery, room starts, and game-over broadcasts.
  - `POST /api/rooms/:code/move`: Validates player turn and executes moves authoritatively on the server, broadcasting updates.
  - `POST /api/rooms/:code/resign`: Allows a player to resign, awarding victory to the opponent and persisting results.
  - Auto-recording: Every checkmate, stalemate, or resignation in an online room automatically records into both users' profile history (`user.games`) in `users_db.json`.
- **UI & Presentation**:
  - Open-access Colin M.L. Burnett chess piece set in high-resolution PNG (`assets/pieces/*.png`).
  - Cold Modern Theme (Nordic Glacier & Arctic Frost palette):
    - Light squares in frosted arctic pearl (`#dce5ec`), dark squares in glacier slate ocean (`#4d6d85`).
    - Chess.com-style coordinate indicators embedded directly inside corner squares (ranks 1-8 on column 'a', files a-h on rank '1') with dynamic high contrast.
    - Active turn indicators on player bar strips with cold cyan glow (`#38bdf8`) and left border pulse.
    - Captured pieces tray with subtle overlap (`margin-left: -5px`) for a compact chess.com aesthetic.
    - Chess.com-style notation sheet history table with sticky header, alternating cool dark rows, and active move cyan badge.
  - Header profile badge with live stats (`X В • Y П • Z Н`), "📊 Профиль", "💾 Сохранить" and "Выйти".
  - Clickable Profile Modal with detailed stats cards (Wins, Losses, Draws, Winrate %) and full chronological game history list.
  - Online Lobby Modal with tabs for "Создать комнату" (generates 6-character code with one-click copy & link sharing) and "Войти по коду".
  - Active Online Match Banner with pulse indicator, room code, role badge, and Resign / Leave controls.
  - Automatic board flipping for Black player in online matches.
  - Direct room link support (`?room=ABC123`).
  - Zero-dependency Web Audio API synthesizer for move, capture, check, and game-over sound effects.

## 2. Directory Structure
```
chess/
├── CONTEXT.md               # Context ledger & architectural records
├── README.md                # Quickstart & documentation
├── render.yaml              # Render Blueprint Infrastructure-as-Code specification
├── package.json             # NPM package scripts (start, test)
├── server.js                # Zero-dependency Node.js HTTP server & API router
├── index.html               # Main entry point & Modals (Auth, Profile, Online Lobby)
├── data/
│   └── users_db.json        # JSON database for accounts, password hashes, sessions & saved games
├── src/
│   ├── db.js                # Database layer (JSON storage, crypto scrypt hashing, sessions, game history)
│   └── rooms.js             # Online multiplayer room management (SSE, 6-char codes, authoritative moves)
├── assets/
│   └── pieces/              # High-res 256x256 PNG piece assets (Wikimedia/Cburnett)
│       ├── wK.png, wQ.png, wR.png, wB.png, wN.png, wP.png
│       └── bK.png, bQ.png, bR.png, bB.png, bN.png, bP.png
├── css/
│   └── style.css            # Chessboard, pieces, auth modal, profile modal, online lobby, and banner styles
├── js/
│   ├── engine.js            # Core chess engine (FIDE rules, checks, mate, SAN)
│   ├── auth.js              # Auth controller, live existence checking, session sync, profile modal
│   ├── online.js            # Online multiplayer controller (room codes, SSE, real-time sync, turns)
│   ├── leaderboard.js       # Hall of Fame & Leaderboard controller (fastest mate, wins, winrate, activity)
│   └── app.js               # UI controller, audio, rendering, events, JSON I/O
└── test/
    ├── db_test.js           # Unit test for JSON DB & crypto password hashing
    ├── server_test.js       # Integration test for HTTP server and auth endpoints
    ├── rooms_test.js        # Unit test for room codes, turn enforcement, checkmate & resignation
    ├── online_api_test.js   # Integration test for online multiplayer REST API & profile persistence
    ├── leaderboard_test.js  # Unit & integration tests for Leaderboard rankings & fastest mate calculation
    ├── chess_test.js        # Engine unit tests (moves, fool's mate, pin, castling, en passant)
    └── more_tests.js        # Extended tests (scholar's mate, double check, underpromotion)
```

## 3. Technology Stack & Environment
- **Runtime**: Node.js v24.21.0 (Zero external dependencies).
- **Multiplayer Transport**: Server-Sent Events (SSE) via native Node.js HTTP stream + REST move submission.
- **Database**: JSON file storage (`data/users_db.json`) with atomic `.tmp` rename commits.
- **Security**: `node:crypto` (`scryptSync` + 16-byte random salt, `timingSafeEqual`).
- **Frontend**: HTML5, CSS3 Grid/Flexbox, Vanilla ES6+ JavaScript.
- **Piece Graphics**: Colin M.L. Burnett public domain / open access PNGs.
- **Audio**: Web Audio API oscillator synthesis.
- **Testing**: Automated test suite (`npm test`).

## 4. Current State & Milestone Progress
- [x] Integrated all 12 open-access PNG chess pieces into `assets/pieces/`.
- [x] Designed and implemented complete FIDE chess engine in `js/engine.js`.
- [x] Implemented JSON database layer in `src/db.js` with atomic file writes.
- [x] Implemented secure password hashing with unique salt and `timingSafeEqual`.
- [x] Created zero-dependency Node.js HTTP server in `server.js` with REST API.
- [x] Implemented live username availability endpoint (`GET /api/auth/check-username`).
- [x] Implemented registration (`POST /api/auth/register`) with duplicate rejection.
- [x] Implemented login (`POST /api/auth/login`) with specific check if account exists.
- [x] Implemented session check (`GET /api/auth/me`) and logout (`POST /api/auth/logout`).
- [x] Implemented cloud game save (`POST /api/user/save-game`) and load (`GET /api/user/load-game`).
- [x] Implemented game results tracking (`POST /api/user/record-result`) updating wins/losses/draws.
- [x] Built frontend Auth Modal with tabs, debounced live username check indicator, and profile badge.
- [x] Added persistent game history recording in profile (`user.games`) in `src/db.js`.
- [x] Created profile game history endpoints (`GET /api/user/games` and `POST /api/user/record-game`).
- [x] Built interactive Profile Modal with statistics cards (Wins, Losses, Draws, Winrate %) and full games history list.
- [x] Built Online Multiplayer Room module (`src/rooms.js`) with 6-character room code generator (unambiguous charset).
- [x] Implemented Server-Sent Events (SSE) stream (`GET /api/rooms/:code/events`) for zero-dependency real-time sync.
- [x] Implemented authoritative server move validation, turn enforcement, and automatic match result recording.
- [x] Created frontend Online Lobby modal (`js/online.js`) with room creation, copy code / link, and room joining.
- [x] Built active Online Match banner with connection indicator, room code, role badge, and resignation/leave actions.
- [x] Added auto-flipping board for Black in online games.
- [x] Added automated test suites: `test/rooms_test.js` and `test/online_api_test.js`.
- [x] Verified full test suite (`npm test`) passes with 0 failures across all 6 test suites.
- [x] Redesigned UI/UX: chess.com-inspired layout, distinct Cold Nordic Glacier & Arctic Frost palette, active turn glows on player bars, overlapping captured piece trays, and modernized notation sheet history table.
- [x] Added cache-busting asset query parameters (`?v=2.3`) to `index.html` to guarantee immediate stylesheet updates in client browsers.
- [x] Implemented Leaderboard & Hall of Fame system (`src/db.js`, `server.js`, `js/leaderboard.js`, `index.html`, `css/style.css`):
  - Track personal fastest checkmate records across both local and online multiplayer games.
  - Multi-category leaderboards: Fastest Checkmate (fewest moves/half-moves), Most Wins, Best Winrate %, Most Active players.
  - Interactive modal with real-time category switching, gold/silver/bronze rank badges, current user highlight, personal rank banner, and guest-login prompt.
  - Profile modal enhancement showing player's all-time fastest checkmate record.
  - Full automated unit & integration test suite (`test/leaderboard_test.js`) verified with `npm test`.
- [x] Render Deployment & Production PostgreSQL Setup:
  - Installed official Render CLI (v2.38.0).
  - Provisioned Render PostgreSQL managed database `chess-db` (ID: `dpg-dc0ksnek1f9s739fo0m0-a`, Postgres v18, region frankfurt, plan free) in project `GWTChess`.
  - Added hybrid storage architecture to `src/db.js`: automatic PostgreSQL integration via `pg.Pool` with JSON fallback for local testing/development.
  - Implemented transactional database persistence (`chess_users`, `chess_sessions`) and automatic migration of local JSON database accounts into PostgreSQL on first boot.
  - Deployed Render Web Service `chess-online` (ID: `srv-dc0kuku7bikc73b4gf9g`, plan free, region frankfurt, Node.js runtime) connected via secure internal connection string to `chess-db`.
  - Configured zero-downtime healthcheck on `/healthz`.
  - Production URL live and verified: `https://chess-online-yxfk.onrender.com`.
  - Verified live registration, authentication, leaderboard API, and PostgreSQL persistence with 0 errors.
