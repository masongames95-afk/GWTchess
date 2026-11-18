# Chess in Browser (FIDE-compliant Engine + JSON DB Authentication & Persistence)

## 1. Project Overview & Architecture
Full-stack browser-based chess game featuring FIDE-compliant rules, open-source PNG piece aesthetics, and a lightweight zero-dependency Node.js server with a JSON file database for user registration, authentication, live account checking, and cloud state persistence.

- **Frontend Target**: Pure vanilla JavaScript (`js/engine.js`, `js/app.js`, `js/auth.js`) with responsive CSS3.
- **Backend & Database**:
  - Zero-dependency Node.js HTTP server (`server.js`) on port 3000.
  - JSON file-based database (`data/users_db.json`) via `src/db.js` with atomic file writes to prevent race conditions.
  - Cryptographically secure password hashing using `node:crypto` (`scryptSync` with unique random salt per user).
  - Constant-time password validation (`timingSafeEqual`) against timing attacks.
  - Cryptographically generated session tokens (32 bytes hex) sent via `Set-Cookie: session_id=...; HttpOnly; SameSite=Lax`.
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
- **UI & Presentation**:
  - Open-access Colin M.L. Burnett chess piece set in high-resolution PNG (`assets/pieces/*.png`).
  - Modern tournament wooden theme with coordinate indicators on square corners.
  - Header profile badge with live stats (`X В • Y П • Z Н`), "Сохранить в БД" and "Выйти".
  - Fullscreen Auth Modal with tabs for "Вход" and "Регистрация".
  - Real-time debounced username availability validation on registration input with status badges (✓ свободно, ✗ уже существует).
  - Interactive Pawn Promotion Modal & Game Over Modal.
  - Zero-dependency Web Audio API synthesizer for sound effects.

## 2. Directory Structure
```
chess/
├── CONTEXT.md               # Context ledger & architectural records
├── README.md                # Quickstart & documentation
├── package.json             # NPM package scripts (start, test)
├── server.js                # Zero-dependency Node.js HTTP server & API router
├── index.html               # Main entry point & Auth modal
├── data/
│   └── users_db.json        # JSON database for accounts, password hashes, sessions & saved games
├── src/
│   └── db.js                # Database layer (JSON storage, crypto scrypt hashing, sessions)
├── assets/
│   └── pieces/              # High-res 256x256 PNG piece assets (Wikimedia/Cburnett)
│       ├── wK.png, wQ.png, wR.png, wB.png, wN.png, wP.png
│       └── bK.png, bQ.png, bR.png, bB.png, bN.png, bP.png
├── css/
│   └── style.css            # Chessboard, pieces, auth modal, user badge, and control styles
├── js/
│   ├── engine.js            # Core chess engine (FIDE rules, checks, mate, SAN)
│   ├── auth.js              # Auth controller, live existence checking, session sync
│   └── app.js               # UI controller, audio, rendering, events, JSON I/O
└── test/
    ├── db_test.js           # Unit test for JSON DB & crypto password hashing
    ├── server_test.js       # Integration test for HTTP server and auth endpoints
    ├── chess_test.js        # Engine unit tests (moves, fool's mate, pin, castling, en passant)
    └── more_tests.js        # Extended tests (scholar's mate, double check, underpromotion)
```

## 3. Technology Stack & Environment
- **Runtime**: Node.js v24.21.0 (Zero external dependencies).
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
- [x] Connected game over outcomes (checkmate/stalemate) to automatically update user stats.
- [x] Added `test/db_test.js` and `test/server_test.js` covering 100% of auth and DB flows.
- [x] Verified full test suite (`npm test`) passes with 0 failures.
