/**
 * Browser Chess Client
 */

const PIECE_SYMBOLS = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟'
};

const API_ENDPOINT = 'api/game.php';

let gameState = null;
let selectedSquare = null;

// DOM Elements
const boardEl = document.getElementById('chessboard');
const turnIndicatorEl = document.getElementById('turn-indicator');
const moveCountEl = document.getElementById('move-count');
const historyEl = document.getElementById('move-history');
const messageBoxEl = document.getElementById('message-box');
const btnReset = document.getElementById('btn-reset');
const capturedWhiteEl = document.getElementById('captured-by-white');
const capturedBlackEl = document.getElementById('captured-by-black');

/**
 * Converts row, col to algebraic square notation (e.g. 7, 4 -> 'e1')
 */
function coordsToAlgebraic(row, col) {
    const file = String.fromCharCode('a'.charCodeAt(0) + col);
    const rank = 8 - row;
    return `${file}${rank}`;
}

/**
 * Converts algebraic square notation to row, col
 */
function algebraicToCoords(square) {
    const col = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const row = 8 - parseInt(square[1], 10);
    return { row, col };
}

/**
 * Displays user message
 */
function showMessage(text, isError = false) {
    messageBoxEl.textContent = text;
    messageBoxEl.className = 'message-box ' + (isError ? 'error' : 'info');
}

/**
 * Fetches latest game state from backend
 */
async function fetchGameState() {
    try {
        const response = await fetch(API_ENDPOINT);
        const data = await response.json();
        if (data.success && data.state) {
            gameState = data.state;
            render();
        } else {
            showMessage(data.error || 'Ошибка загрузки игры', true);
        }
    } catch (err) {
        showMessage('Ошибка связи с сервером', true);
        console.error(err);
    }
}

/**
 * Sends move request to backend
 */
async function sendMove(from, to) {
    try {
        showMessage('Отправка хода...');
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'move', from, to })
        });

        const data = await response.json();
        if (data.success && data.state) {
            gameState = data.state;
            selectedSquare = null;
            showMessage(`Ход выполнен: ${from} → ${to}`);
            render();
        } else {
            showMessage(data.error || 'Недопустимый ход', true);
            selectedSquare = null;
            render();
        }
    } catch (err) {
        showMessage('Ошибка при выполнении хода', true);
        console.error(err);
    }
}

/**
 * Resets the game on backend
 */
async function resetGame() {
    if (!confirm('Вы уверены, что хотите начать новую игру?')) return;

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reset' })
        });

        const data = await response.json();
        if (data.success && data.state) {
            gameState = data.state;
            selectedSquare = null;
            showMessage('Игра сброшена.');
            render();
        }
    } catch (err) {
        showMessage('Ошибка сброса игры', true);
        console.error(err);
    }
}

/**
 * Handles click on a chessboard square
 */
function handleSquareClick(row, col) {
    if (!gameState) return;

    const square = coordsToAlgebraic(row, col);
    const piece = gameState.board[row][col];
    const currentTurn = gameState.turn;

    // No selection yet
    if (!selectedSquare) {
        if (!piece) return;

        const pieceColor = piece.startsWith('w') ? 'white' : 'black';
        if (pieceColor !== currentTurn) {
            showMessage(`Сейчас ход ${currentTurn === 'white' ? 'белых' : 'черных'}!`, true);
            return;
        }

        selectedSquare = square;
        render();
        return;
    }

    // Square is already selected
    if (selectedSquare === square) {
        // Deselect
        selectedSquare = null;
        render();
        return;
    }

    // If clicking another piece of the same color, switch selection
    if (piece) {
        const pieceColor = piece.startsWith('w') ? 'white' : 'black';
        if (pieceColor === currentTurn) {
            selectedSquare = square;
            render();
            return;
        }
    }

    // Execute move
    sendMove(selectedSquare, square);
}

/**
 * Renders the entire UI
 */
function render() {
    if (!gameState) return;

    // Update Indicators
    const turnRu = gameState.turn === 'white' ? 'Белые' : 'Черные';
    turnIndicatorEl.innerHTML = `Ход: <strong>${turnRu}</strong>`;
    moveCountEl.innerHTML = `Ходов: <strong>${gameState.moveCount}</strong>`;

    // Render Board
    boardEl.innerHTML = '';
    const lastMove = gameState.history.length > 0 ? gameState.history[gameState.history.length - 1] : null;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sqName = coordsToAlgebraic(r, c);
            const isLight = (r + c) % 2 === 0;
            const pieceCode = gameState.board[r][c];

            const sqEl = document.createElement('div');
            sqEl.className = `square ${isLight ? 'light' : 'dark'}`;
            sqEl.dataset.square = sqName;

            if (selectedSquare === sqName) {
                sqEl.classList.add('selected');
            }

            if (lastMove && (lastMove.from === sqName || lastMove.to === sqName)) {
                sqEl.classList.add('last-move');
            }

            if (pieceCode) {
                const pieceEl = document.createElement('span');
                const isWhite = pieceCode.startsWith('w');
                pieceEl.className = `piece ${isWhite ? 'white' : 'black'}`;
                pieceEl.textContent = PIECE_SYMBOLS[pieceCode] || '?';
                sqEl.appendChild(pieceEl);
            }

            sqEl.addEventListener('click', () => handleSquareClick(r, c));
            boardEl.appendChild(sqEl);
        }
    }

    // Render History
    historyEl.innerHTML = '';
    gameState.history.forEach((m, idx) => {
        const li = document.createElement('li');
        li.textContent = `${idx + 1}. ${m.piece} (${m.from} → ${m.to})${m.captured ? ' x ' + m.captured : ''}`;
        historyEl.appendChild(li);
    });
    historyEl.scrollTop = historyEl.scrollHeight;

    // Render Captured Pieces
    renderCaptured(capturedWhiteEl, gameState.captured.white);
    renderCaptured(capturedBlackEl, gameState.captured.black);
}

function renderCaptured(container, list) {
    container.innerHTML = '';
    if (!list || list.length === 0) {
        container.textContent = '—';
        return;
    }
    list.forEach(p => {
        const span = document.createElement('span');
        span.className = 'captured-piece';
        span.textContent = PIECE_SYMBOLS[p] || p;
        container.appendChild(span);
    });
}

// Initial binding
btnReset.addEventListener('click', resetGame);
fetchGameState();
