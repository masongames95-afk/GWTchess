/**
 * Browser Chess UI Controller
 * Integrates with engine.js, renders high-res PNG pieces, manages sound,
 * board flipping, promotion dialogs, game-over alerts, and JSON persistence.
 */

const STORAGE_KEY = 'browser_chess_v2_state';
const SOUND_KEY = 'browser_chess_sound_enabled';

// Audio Synthesizer (Zero-dependency Web Audio API)
class ChessAudio {
    constructor() {
        this.ctx = null;
        this.enabled = localStorage.getItem(SOUND_KEY) !== 'false';
    }

    init() {
        if (!this.ctx && typeof AudioContext !== 'undefined') {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem(SOUND_KEY, this.enabled ? 'true' : 'false');
        return this.enabled;
    }

    playMove() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
    }

    playCapture() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        // Thud
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.1);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playCheck() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        [520, 680].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.07);
            gain.gain.setValueAtTime(0.2, now + idx * 0.07);
            gain.gain.linearRampToValueAtTime(0.01, now + idx * 0.07 + 0.15);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.07);
            osc.stop(now + idx * 0.07 + 0.15);
        });
    }

    playGameOver() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        [392, 523.25, 659.25, 783.99].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);
            gain.gain.setValueAtTime(0.25, now + idx * 0.08);
            gain.gain.linearRampToValueAtTime(0.01, now + idx * 0.08 + 0.3);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.3);
        });
    }
}

// Global UI State
const audio = new ChessAudio();
let gameState = null;
let selectedSquare = null;
let legalMoves = [];
let isFlipped = false;
let pendingPromotion = null; // { from, to, color }

// DOM Elements
const boardEl = document.getElementById('chessboard');
const turnBadgeEl = document.getElementById('turn-badge');
const turnTextEl = document.getElementById('turn-text');
const checkAlertEl = document.getElementById('check-alert');
const btnSoundToggle = document.getElementById('btn-sound-toggle');

const nameTopEl = document.getElementById('name-top');
const nameBottomEl = document.getElementById('name-bottom');
const avatarTopEl = document.getElementById('avatar-top');
const avatarBottomEl = document.getElementById('avatar-bottom');
const capturedTopEl = document.getElementById('captured-top');
const capturedBottomEl = document.getElementById('captured-bottom');
const materialTopEl = document.getElementById('material-top');
const materialBottomEl = document.getElementById('material-bottom');

const btnReset = document.getElementById('btn-reset');
const btnFlip = document.getElementById('btn-flip');
const btnExportJson = document.getElementById('btn-export-json');
const jsonFileInput = document.getElementById('json-file-input');
const messageBoxEl = document.getElementById('message-box');

const historyTbodyEl = document.getElementById('history-tbody');
const moveTotalEl = document.getElementById('move-total');

const promotionOverlay = document.getElementById('promotion-overlay');
const promotionChoicesEl = document.getElementById('promotion-choices');

const gameOverOverlay = document.getElementById('game-over-overlay');
const gameOverTitleEl = document.getElementById('game-over-title');
const gameOverDescEl = document.getElementById('game-over-desc');
const gameOverIconEl = document.getElementById('game-over-icon');
const btnModalRestart = document.getElementById('btn-modal-restart');
const btnModalClose = document.getElementById('btn-modal-close');

/**
 * Message Display
 */
function showMessage(text, isError = false) {
    messageBoxEl.textContent = text;
    messageBoxEl.className = 'message-box ' + (isError ? 'error' : 'info');
}

/**
 * State Persistence
 */
function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
    } catch (e) {
        console.warn('LocalStorage save failed:', e);
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && Array.isArray(parsed.board) && parsed.board.length === 8) {
                // Restore castling rights and state fields
                return parsed;
            }
        }
    } catch (e) {
        console.warn('LocalStorage load failed:', e);
    }
    return createInitialState();
}

/**
 * JSON Export & Import
 */
function exportToJson() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(gameState, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `chess_game_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showMessage('Партия сохранена в файл JSON.');
}

function importFromJson(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!imported || !Array.isArray(imported.board) || imported.board.length !== 8) {
                throw new Error('Некорректная шахматная доска в JSON файле.');
            }

            gameState = {
                id: imported.id || 'imported_' + Date.now(),
                turn: imported.turn === 'black' ? 'black' : 'white',
                status: imported.status || 'active',
                winner: imported.winner || null,
                moveCount: typeof imported.moveCount === 'number' ? imported.moveCount : 0,
                history: Array.isArray(imported.history) ? imported.history : [],
                captured: imported.captured || { white: [], black: [] },
                castlingRights: imported.castlingRights || {
                    white: { kingSide: true, queenSide: true },
                    black: { kingSide: true, queenSide: true }
                },
                enPassantTarget: imported.enPassantTarget || null,
                halfMoveClock: imported.halfMoveClock || 0,
                board: imported.board
            };

            // Verify status with engine
            updateGameStatus(gameState);

            selectedSquare = null;
            legalMoves = [];
            pendingPromotion = null;
            promotionOverlay.classList.add('hidden');
            gameOverOverlay.classList.add('hidden');

            saveState();
            render();
            showMessage(`Партия "${file.name}" успешно загружена!`);
        } catch (err) {
            showMessage('Ошибка загрузки JSON: ' + err.message, true);
        }
    };
    reader.readAsText(file);
}

/**
 * Execution of move (direct or after promotion selection)
 */
function finalizeMove(from, to, promotionChoice = 'Q') {
    // If this is an active online match, forward move to server
    if (window.onlineController && window.onlineController.isOnlineMatch) {
        selectedSquare = null;
        legalMoves = [];
        pendingPromotion = null;
        promotionOverlay.classList.add('hidden');
        window.onlineController.sendMoveToServer(from, to, promotionChoice);
        return;
    }

    const res = makeMove(gameState, from, to, promotionChoice);

    if (!res.success) {
        showMessage(res.error || 'Недопустимый ход.', true);
        return;
    }

    selectedSquare = null;
    legalMoves = [];
    pendingPromotion = null;
    promotionOverlay.classList.add('hidden');

    // Play appropriate sound
    if (res.status === 'checkmate') {
        audio.playGameOver();
    } else if (res.status === 'check') {
        audio.playCheck();
    } else if (res.move && (res.move.isCapture || res.move.isEnPassant)) {
        audio.playCapture();
    } else {
        audio.playMove();
    }

    saveState();
    render();

    // Feedback message
    if (res.status === 'checkmate') {
        const winnerName = res.winner === 'white' ? 'Белые' : 'Черные';
        showMessage(`МАТ! ${winnerName} победили!`, false);
        openGameOverModal(`Мат! Победили ${winnerName}`, `Партия завершена за ${Math.ceil(gameState.moveCount / 2)} ходов.`);
        if (window.authController) {
            window.authController.recordGameOutcome(res.winner === 'white' ? 'win' : 'loss', 'checkmate', gameState.moveCount);
        }
    } else if (res.status === 'stalemate') {
        showMessage('ПАТ! Ничья.', false);
        openGameOverModal('Пат! Ничья', 'У игрока нет доступных ходов, но король не находится под шахом.');
        if (window.authController) {
            window.authController.recordGameOutcome('draw', 'stalemate', gameState.moveCount);
        }
    } else if (res.status === 'check') {
        showMessage(`Ход ${res.san}. Внимание: ШАХ!`);
    } else {
        showMessage(`Ход ${res.san}`);
    }
}

/**
 * Promotion Selection Handler
 */
function openPromotionModal(from, to, color) {
    pendingPromotion = { from, to, color };
    promotionChoicesEl.innerHTML = '';

    const choices = [
        { type: 'Q', label: 'Ферзь' },
        { type: 'R', label: 'Ладья' },
        { type: 'B', label: 'Слон' },
        { type: 'N', label: 'Конь' }
    ];

    choices.forEach(ch => {
        const btn = document.createElement('button');
        btn.className = 'promo-choice-btn';
        const pieceCode = (color === 'white' ? 'w' : 'b') + ch.type;

        btn.innerHTML = `
            <img src="assets/pieces/${pieceCode}.png" alt="${ch.label}" class="promo-img">
            <span>${ch.label}</span>
        `;

        btn.addEventListener('click', () => {
            finalizeMove(pendingPromotion.from, pendingPromotion.to, ch.type);
        });

        promotionChoicesEl.appendChild(btn);
    });

    promotionOverlay.classList.remove('hidden');
}

/**
 * Game Over Modal
 */
function openGameOverModal(title, desc) {
    gameOverTitleEl.textContent = title;
    gameOverDescEl.textContent = desc;
    gameOverIconEl.textContent = gameState.status === 'checkmate' ? '🏆' : '🤝';
    gameOverOverlay.classList.remove('hidden');
}

/**
 * Click handler on board squares
 */
function handleSquareClick(r, c) {
    if (gameState.status === 'checkmate' || gameState.status === 'stalemate') {
        showMessage('Партия завершена. Начните новую игру.', true);
        return;
    }

    if (pendingPromotion) return; // Wait for promotion dialog

    // Online game validation
    if (window.onlineController && window.onlineController.isOnlineMatch) {
        if (!window.onlineController.canMoveSquare(r, c)) {
            return;
        }
    }

    const clickedSquare = coordsToAlgebraic(r, c);
    const piece = gameState.board[r][c];
    const currentTurn = gameState.turn;

    // If no square selected currently
    if (!selectedSquare) {
        if (!piece) return;

        const pieceColor = piece[0] === 'w' ? 'white' : 'black';

        // Online mode: enforce choosing only the player's own pieces
        if (window.onlineController && window.onlineController.isOnlineMatch) {
            const myColor = window.onlineController.activeRoom?.color;
            if (pieceColor !== myColor) {
                showMessage(`Вы играете за ${myColor === 'white' ? 'белых' : 'черных'}! Нельзя ходить фигурами соперника.`, true);
                return;
            }
        }

        if (pieceColor !== currentTurn) {
            showMessage(`Сейчас ход ${currentTurn === 'white' ? 'белых' : 'черных'}!`, true);
            return;
        }

        const moves = getLegalMovesForSquare(gameState, r, c);
        if (moves.length === 0) {
            showMessage('У этой фигуры нет разрешенных ходов.', true);
            return;
        }

        selectedSquare = clickedSquare;
        legalMoves = moves;
        render();
        return;
    }

    // Clicking already selected square -> unselect
    if (selectedSquare === clickedSquare) {
        selectedSquare = null;
        legalMoves = [];
        render();
        return;
    }

    // Clicking another friendly piece -> switch selection
    if (piece && (piece[0] === 'w' ? 'white' : 'black') === currentTurn) {
        if (window.onlineController && window.onlineController.isOnlineMatch) {
            const myColor = window.onlineController.activeRoom?.color;
            if ((piece[0] === 'w' ? 'white' : 'black') !== myColor) return;
        }
        selectedSquare = clickedSquare;
        legalMoves = getLegalMovesForSquare(gameState, r, c);
        render();
        return;
    }

    // Check if clicked square is among legal moves
    const matchingMove = legalMoves.find(m => m.row === r && m.col === c);
    if (matchingMove) {
        if (matchingMove.isPromotion) {
            // Open promotion modal
            openPromotionModal(selectedSquare, clickedSquare, currentTurn);
        } else {
            finalizeMove(selectedSquare, clickedSquare);
        }
    } else {
        showMessage('Этот ход запрещен правилами шахмат.', true);
    }
}

/**
 * Reset Game
 */
function resetGame() {
    if (window.onlineController && window.onlineController.isOnlineMatch) {
        showMessage('В онлайн-партии используйте кнопку «Сдаться» или «Выйти».', true);
        return;
    }

    if (gameState.history.length > 0) {
        if (!confirm('Начать новую партию? Текущий прогресс будет сброшен.')) return;
    }
    gameState = createInitialState();
    selectedSquare = null;
    legalMoves = [];
    pendingPromotion = null;
    promotionOverlay.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    saveState();
    render();
    showMessage('Начата новая партия. Ход белых.');
}

/**
 * Render Complete UI
 */
function render() {
    if (!gameState) return;

    // 1. Header Turn & Status
    const isWhiteTurn = gameState.turn === 'white';
    turnBadgeEl.className = `turn-badge ${isWhiteTurn ? 'turn-white' : 'turn-black'}`;
    turnTextEl.textContent = isWhiteTurn ? 'Ход белых' : 'Ход черных';

    if (gameState.status === 'check') {
        checkAlertEl.classList.remove('hidden');
    } else {
        checkAlertEl.classList.add('hidden');
    }

    // 2. Sound Icon State
    btnSoundToggle.textContent = audio.enabled ? '🔊' : '🔇';

    // 3. Player Bars Configuration (considering isFlipped)
    const topColor = isFlipped ? 'white' : 'black';
    const bottomColor = isFlipped ? 'black' : 'white';

    nameTopEl.textContent = topColor === 'white' ? 'Белые' : 'Черные';
    nameBottomEl.textContent = bottomColor === 'white' ? 'Белые' : 'Черные';
    avatarTopEl.textContent = topColor === 'white' ? '♔' : '♚';
    avatarBottomEl.textContent = bottomColor === 'white' ? '♚' : '♔';

    // Captured pieces: pieces captured BY that player
    renderCaptured(capturedTopEl, gameState.captured[topColor]);
    renderCaptured(capturedBottomEl, gameState.captured[bottomColor]);

    // Material Advantage
    const mat = evaluateMaterial(gameState.captured);
    renderMaterialAdvantage(topColor, bottomColor, mat);

    // 4. Render Chessboard
    boardEl.innerHTML = '';
    const lastMove = gameState.history.length > 0 ? gameState.history[gameState.history.length - 1] : null;
    const checkedKingPos = (gameState.status === 'check' || gameState.status === 'checkmate')
        ? findKing(gameState.board, gameState.turn)
        : null;

    // Rows and Columns iteration based on isFlipped
    const rowIndices = isFlipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
    const colIndices = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    const displayRows = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    for (let ri = 0; ri < 8; ri++) {
        const r = displayRows[ri];
        for (let ci = 0; ci < 8; ci++) {
            const c = colIndices[ci];
            const sqName = coordsToAlgebraic(r, c);
            const isLight = (r + c) % 2 === 0;
            const pieceCode = gameState.board[r][c];

            const sqEl = document.createElement('div');
            sqEl.className = `square ${isLight ? 'light' : 'dark'}`;
            sqEl.dataset.square = sqName;

            // Coordinates in corners
            // Rank coordinate on the leftmost visible square of each row
            if (ci === 0) {
                const rankSpan = document.createElement('span');
                rankSpan.className = 'coord-rank';
                rankSpan.textContent = 8 - r;
                sqEl.appendChild(rankSpan);
            }
            // File coordinate on the bottom visible square of each column
            if (ri === 7) {
                const fileSpan = document.createElement('span');
                fileSpan.className = 'coord-file';
                fileSpan.textContent = String.fromCharCode('a'.charCodeAt(0) + c);
                sqEl.appendChild(fileSpan);
            }

            // Highlights
            if (selectedSquare === sqName) {
                sqEl.classList.add('selected');
            }

            if (lastMove && (lastMove.from === sqName || lastMove.to === sqName)) {
                sqEl.classList.add('last-move');
            }

            if (checkedKingPos && checkedKingPos.row === r && checkedKingPos.col === c) {
                sqEl.classList.add('in-check');
            }

            // Legal moves highlights
            const legalTarget = legalMoves.find(m => m.row === r && m.col === c);
            if (legalTarget) {
                sqEl.classList.add(legalTarget.isCapture ? 'legal-capture' : 'legal-target');
            }

            // Piece image
            if (pieceCode) {
                const imgEl = document.createElement('img');
                imgEl.src = `assets/pieces/${pieceCode}.png`;
                imgEl.alt = PIECE_NAMES[pieceCode[1]] || pieceCode;
                imgEl.className = 'piece-img';
                imgEl.draggable = false;
                // Graceful fallback to text symbol if image fails
                imgEl.onerror = () => {
                    const fallback = document.createElement('span');
                    fallback.className = 'piece-fallback';
                    fallback.textContent = PIECE_SYMBOLS[pieceCode] || '?';
                    sqEl.replaceChild(fallback, imgEl);
                };
                sqEl.appendChild(imgEl);
            }

            sqEl.addEventListener('click', () => handleSquareClick(r, c));
            boardEl.appendChild(sqEl);
        }
    }

    // 5. Move History Table
    renderHistoryTable();
}

/**
 * Render Captured pieces row
 */
function renderCaptured(container, piecesList) {
    container.innerHTML = '';
    if (!piecesList || piecesList.length === 0) return;

    // Sort pieces by value (Pawns first, Queens last)
    const sorted = [...piecesList].sort((a, b) => {
        return (PIECE_VALUES[a[1]] || 0) - (PIECE_VALUES[b[1]] || 0);
    });

    sorted.forEach(pieceCode => {
        const img = document.createElement('img');
        img.src = `assets/pieces/${pieceCode}.png`;
        img.alt = pieceCode;
        img.className = 'captured-icon';
        img.title = PIECE_NAMES[pieceCode[1]] || pieceCode;
        container.appendChild(img);
    });
}

/**
 * Render Material Advantage Badges
 */
function renderMaterialAdvantage(topColor, bottomColor, mat) {
    materialTopEl.className = 'material-advantage';
    materialBottomEl.className = 'material-advantage';

    const diff = mat.diff; // whiteScore - blackScore
    if (diff > 0) { // White ahead
        if (bottomColor === 'white') {
            materialBottomEl.textContent = `+${diff}`;
            materialBottomEl.classList.add('visible');
        } else {
            materialTopEl.textContent = `+${diff}`;
            materialTopEl.classList.add('visible');
        }
    } else if (diff < 0) { // Black ahead
        const absDiff = Math.abs(diff);
        if (bottomColor === 'black') {
            materialBottomEl.textContent = `+${absDiff}`;
            materialBottomEl.classList.add('visible');
        } else {
            materialTopEl.textContent = `+${absDiff}`;
            materialTopEl.classList.add('visible');
        }
    }
}

/**
 * Render 2-column Move History
 */
function renderHistoryTable() {
    historyTbodyEl.innerHTML = '';
    const history = gameState.history;
    moveTotalEl.textContent = `${history.length} ${history.length === 1 ? 'ход' : 'ходов'}`;

    const turnsCount = Math.ceil(history.length / 2);
    for (let t = 0; t < turnsCount; t++) {
        const tr = document.createElement('tr');
        const whiteMove = history[t * 2];
        const blackMove = history[t * 2 + 1];

        const isLatestTurn = (t === turnsCount - 1);
        if (isLatestTurn) tr.classList.add('latest-turn');

        const tdNum = document.createElement('td');
        tdNum.className = 'col-num';
        tdNum.textContent = `${t + 1}.`;
        tr.appendChild(tdNum);

        const tdWhite = document.createElement('td');
        if (whiteMove) {
            tdWhite.textContent = whiteMove.san;
            if (isLatestTurn && !blackMove) tdWhite.classList.add('active-move');
        }
        tr.appendChild(tdWhite);

        const tdBlack = document.createElement('td');
        if (blackMove) {
            tdBlack.textContent = blackMove.san;
            if (isLatestTurn) tdBlack.classList.add('active-move');
        }
        tr.appendChild(tdBlack);

        historyTbodyEl.appendChild(tr);
    }

    const wrapper = document.querySelector('.history-table-wrapper');
    if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
}

/**
 * Event Listeners & Bindings
 */
btnReset.addEventListener('click', resetGame);

btnFlip.addEventListener('click', () => {
    isFlipped = !isFlipped;
    render();
    showMessage(isFlipped ? 'Доска перевернута (вид за черных)' : 'Доска перевернута (вид за белых)');
});

btnSoundToggle.addEventListener('click', () => {
    const isEnabled = audio.toggle();
    btnSoundToggle.textContent = isEnabled ? '🔊' : '🔇';
    showMessage(isEnabled ? 'Звуковые эффекты включены' : 'Звуковые эффекты отключены');
});

btnExportJson.addEventListener('click', exportToJson);

jsonFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        importFromJson(e.target.files[0]);
        e.target.value = '';
    }
});

btnModalRestart.addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    resetGame();
});

btnModalClose.addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
});

// Initialize on Load
gameState = loadState();
updateGameStatus(gameState);
render();

if (gameState.status === 'checkmate') {
    showMessage(`Партия завершена: МАТ! Победили ${gameState.winner === 'white' ? 'Белые' : 'Черные'}.`);
} else if (gameState.status === 'check') {
    showMessage('Внимание: Король находится под шахом!');
} else {
    showMessage('Шахматная партия готова! Выберите фигуру своего цвета для хода.');
}
