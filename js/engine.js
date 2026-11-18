/**
 * Professional Chess Engine Core (FIDE rules compliant)
 * Handles move generation, check/checkmate/stalemate detection,
 * pins, castling, en passant, promotion, and state updates.
 */

const DEFAULT_BOARD = [
    ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
    ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
    ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR']
];

const PIECE_SYMBOLS = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟'
};

const PIECE_NAMES = {
    'K': 'Король', 'Q': 'Ферзь', 'R': 'Ладья',
    'B': 'Слон', 'N': 'Конь', 'P': 'Пешка'
};

const PIECE_VALUES = {
    'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 0
};

function coordsToAlgebraic(row, col) {
    const file = String.fromCharCode('a'.charCodeAt(0) + col);
    const rank = 8 - row;
    return `${file}${rank}`;
}

function algebraicToCoords(square) {
    if (!square || typeof square !== 'string' || square.length < 2) return null;
    const col = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const row = 8 - parseInt(square[1], 10);
    return { row, col };
}

function isInsideBoard(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function cloneBoard(board) {
    return board.map(row => [...row]);
}

function createInitialState() {
    return {
        id: 'chess_' + Date.now(),
        turn: 'white',
        status: 'active', // 'active' | 'check' | 'checkmate' | 'stalemate'
        winner: null,     // null | 'white' | 'black' | 'draw'
        moveCount: 0,
        history: [],
        captured: {
            white: [], // captured pieces by white
            black: []  // captured pieces by black
        },
        castlingRights: {
            white: { kingSide: true, queenSide: true },
            black: { kingSide: true, queenSide: true }
        },
        enPassantTarget: null, // { row, col } or null
        halfMoveClock: 0,
        board: cloneBoard(DEFAULT_BOARD)
    };
}

function findKing(board, color) {
    const target = color === 'white' ? 'wK' : 'bK';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] === target) {
                return { row: r, col: c };
            }
        }
    }
    return null;
}

/**
 * Checks if target square (r, c) is attacked by any piece of attackerColor
 */
function isSquareAttacked(board, r, c, attackerColor) {
    const pawnDir = attackerColor === 'white' ? 1 : -1; // row offset of pawn that could attack (r,c)
    const pawnPiece = attackerColor === 'white' ? 'wP' : 'bP';
    const knightPiece = attackerColor === 'white' ? 'wN' : 'bN';
    const bishopPiece = attackerColor === 'white' ? 'wB' : 'bB';
    const rookPiece = attackerColor === 'white' ? 'wR' : 'bR';
    const queenPiece = attackerColor === 'white' ? 'wQ' : 'bQ';
    const kingPiece = attackerColor === 'white' ? 'wK' : 'bK';

    // 1. Pawn attacks
    const pawnRow = r + pawnDir;
    if (pawnRow >= 0 && pawnRow < 8) {
        if (c - 1 >= 0 && board[pawnRow][c - 1] === pawnPiece) return true;
        if (c + 1 < 8 && board[pawnRow][c + 1] === pawnPiece) return true;
    }

    // 2. Knight attacks
    const knightOffsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (const [dr, dc] of knightOffsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (isInsideBoard(nr, nc) && board[nr][nc] === knightPiece) return true;
    }

    // 3. Diagonal rays (Bishop & Queen)
    const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of diagDirs) {
        let step = 1;
        while (true) {
            const nr = r + dr * step;
            const nc = c + dc * step;
            if (!isInsideBoard(nr, nc)) break;
            const p = board[nr][nc];
            if (p) {
                if (p === bishopPiece || p === queenPiece) return true;
                break; // blocked by another piece
            }
            step++;
        }
    }

    // 4. Orthogonal rays (Rook & Queen)
    const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of orthoDirs) {
        let step = 1;
        while (true) {
            const nr = r + dr * step;
            const nc = c + dc * step;
            if (!isInsideBoard(nr, nc)) break;
            const p = board[nr][nc];
            if (p) {
                if (p === rookPiece || p === queenPiece) return true;
                break; // blocked
            }
            step++;
        }
    }

    // 5. King adjacent attacks
    const kingOffsets = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
    ];
    for (const [dr, dc] of kingOffsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (isInsideBoard(nr, nc) && board[nr][nc] === kingPiece) return true;
    }

    return false;
}

function isKingInCheck(board, color) {
    const kingPos = findKing(board, color);
    if (!kingPos) return false;
    const enemyColor = color === 'white' ? 'black' : 'white';
    return isSquareAttacked(board, kingPos.row, kingPos.col, enemyColor);
}

/**
 * Returns pseudo-legal moves for a piece at (r, c)
 */
function getPseudoLegalMovesForSquare(state, r, c) {
    const piece = state.board[r][c];
    if (!piece) return [];

    const color = piece[0] === 'w' ? 'white' : 'black';
    const type = piece[1];
    const enemyColor = color === 'white' ? 'black' : 'white';
    const moves = [];

    const addMoveIfValid = (nr, nc) => {
        if (!isInsideBoard(nr, nc)) return 'blocked';
        const target = state.board[nr][nc];
        if (!target) {
            moves.push({ row: nr, col: nc, isCapture: false });
            return 'empty';
        }
        const targetColor = target[0] === 'w' ? 'white' : 'black';
        if (targetColor !== color) {
            moves.push({ row: nr, col: nc, isCapture: true });
        }
        return 'blocked';
    };

    const scanRays = (directions) => {
        for (const [dr, dc] of directions) {
            let step = 1;
            while (true) {
                const nr = r + dr * step;
                const nc = c + dc * step;
                const result = addMoveIfValid(nr, nc);
                if (result === 'blocked') break;
                step++;
            }
        }
    };

    switch (type) {
        case 'P': {
            const dir = color === 'white' ? -1 : 1;
            const startRow = color === 'white' ? 6 : 1;
            const promoRow = color === 'white' ? 0 : 7;

            // 1 square forward
            const f1 = r + dir;
            if (isInsideBoard(f1, c) && !state.board[f1][c]) {
                const isPromotion = f1 === promoRow;
                moves.push({ row: f1, col: c, isCapture: false, isPromotion });

                // 2 squares forward from start
                const f2 = r + dir * 2;
                if (r === startRow && !state.board[f2][c]) {
                    moves.push({ row: f2, col: c, isCapture: false, isTwoStepPawn: true });
                }
            }

            // Diagonal captures & En Passant
            for (const dc of [-1, 1]) {
                const tc = c + dc;
                if (isInsideBoard(f1, tc)) {
                    const target = state.board[f1][tc];
                    const isPromotion = f1 === promoRow;

                    if (target && (target[0] === 'w' ? 'white' : 'black') !== color) {
                        moves.push({ row: f1, col: tc, isCapture: true, isPromotion });
                    } else if (!target && state.enPassantTarget) {
                        // En passant check
                        if (state.enPassantTarget.row === f1 && state.enPassantTarget.col === tc) {
                            moves.push({ row: f1, col: tc, isCapture: true, isEnPassant: true });
                        }
                    }
                }
            }
            break;
        }

        case 'N': {
            const knightOffsets = [
                [-2, -1], [-2, 1], [-1, -2], [-1, 2],
                [1, -2], [1, 2], [2, -1], [2, 1]
            ];
            for (const [dr, dc] of knightOffsets) {
                addMoveIfValid(r + dr, c + dc);
            }
            break;
        }

        case 'B': {
            scanRays([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
            break;
        }

        case 'R': {
            scanRays([[-1, 0], [1, 0], [0, -1], [0, 1]]);
            break;
        }

        case 'Q': {
            scanRays([
                [-1, -1], [-1, 1], [1, -1], [1, 1],
                [-1, 0], [1, 0], [0, -1], [0, 1]
            ]);
            break;
        }

        case 'K': {
            const kingOffsets = [
                [-1, -1], [-1, 0], [-1, 1],
                [0, -1],           [0, 1],
                [1, -1],  [1, 0],  [1, 1]
            ];
            for (const [dr, dc] of kingOffsets) {
                addMoveIfValid(r + dr, c + dc);
            }

            // Castling
            const rights = state.castlingRights ? state.castlingRights[color] : null;
            if (rights) {
                const kingRow = color === 'white' ? 7 : 0;
                const kingPieceExpected = color === 'white' ? 'wK' : 'bK';
                const rookPieceExpected = color === 'white' ? 'wR' : 'bR';

                if (r === kingRow && c === 4 && state.board[kingRow][4] === kingPieceExpected) {
                    // Check if king is currently in check
                    const inCheck = isSquareAttacked(state.board, kingRow, 4, enemyColor);
                    if (!inCheck) {
                        // Kingside
                        if (rights.kingSide &&
                            state.board[kingRow][7] === rookPieceExpected &&
                            !state.board[kingRow][5] &&
                            !state.board[kingRow][6] &&
                            !isSquareAttacked(state.board, kingRow, 5, enemyColor) &&
                            !isSquareAttacked(state.board, kingRow, 6, enemyColor)
                        ) {
                            moves.push({ row: kingRow, col: 6, isCapture: false, isCastling: 'K' });
                        }

                        // Queenside
                        if (rights.queenSide &&
                            state.board[kingRow][0] === rookPieceExpected &&
                            !state.board[kingRow][1] &&
                            !state.board[kingRow][2] &&
                            !state.board[kingRow][3] &&
                            !isSquareAttacked(state.board, kingRow, 3, enemyColor) &&
                            !isSquareAttacked(state.board, kingRow, 2, enemyColor)
                        ) {
                            moves.push({ row: kingRow, col: 2, isCapture: false, isCastling: 'Q' });
                        }
                    }
                }
            }
            break;
        }
    }

    return moves;
}

/**
 * Filter pseudo-legal moves by checking king safety after move simulation
 */
function getLegalMovesForSquare(state, r, c) {
    const piece = state.board[r][c];
    if (!piece) return [];

    const color = piece[0] === 'w' ? 'white' : 'black';
    const pseudoMoves = getPseudoLegalMovesForSquare(state, r, c);
    const legalMoves = [];

    for (const move of pseudoMoves) {
        // Simulate move on a cloned board
        const simBoard = cloneBoard(state.board);

        // Move piece
        simBoard[move.row][move.col] = piece;
        simBoard[r][c] = null;

        // Special: En Passant
        if (move.isEnPassant) {
            simBoard[r][move.col] = null; // captured pawn removed
        }

        // Special: Castling (move the rook too)
        if (move.isCastling === 'K') {
            simBoard[r][5] = simBoard[r][7];
            simBoard[r][7] = null;
        } else if (move.isCastling === 'Q') {
            simBoard[r][3] = simBoard[r][0];
            simBoard[r][0] = null;
        }

        // Verify that own King is NOT in check
        if (!isKingInCheck(simBoard, color)) {
            legalMoves.push(move);
        }
    }

    return legalMoves;
}

/**
 * Gets all legal moves for a player
 */
function getAllLegalMoves(state, color) {
    const moves = [];
    const prefix = color === 'white' ? 'w' : 'b';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = state.board[r][c];
            if (piece && piece[0] === prefix) {
                const sqMoves = getLegalMovesForSquare(state, r, c);
                for (const m of sqMoves) {
                    moves.push({ from: { row: r, col: c }, to: m });
                }
            }
        }
    }

    return moves;
}

/**
 * Updates status of game (active, check, checkmate, stalemate)
 */
function updateGameStatus(state) {
    const currentTurn = state.turn;
    const opponent = currentTurn === 'white' ? 'black' : 'white';
    const legalMoves = getAllLegalMoves(state, currentTurn);
    const kingInCheck = isKingInCheck(state.board, currentTurn);

    if (legalMoves.length === 0) {
        if (kingInCheck) {
            state.status = 'checkmate';
            state.winner = opponent;
        } else {
            state.status = 'stalemate';
            state.winner = 'draw';
        }
    } else {
        if (kingInCheck) {
            state.status = 'check';
        } else {
            state.status = 'active';
        }
    }
}

/**
 * Converts a move to Standard Algebraic Notation (SAN)
 */
function toSAN(stateBefore, fromCoords, toCoords, moveDetail, piece, promotionPiece) {
    if (moveDetail.isCastling === 'K') return 'O-O';
    if (moveDetail.isCastling === 'Q') return 'O-O-O';

    const pType = piece[1];
    const fromAlg = coordsToAlgebraic(fromCoords.row, fromCoords.col);
    const toAlg = coordsToAlgebraic(toCoords.row, toCoords.col);
    let san = '';

    if (pType === 'P') {
        if (moveDetail.isCapture || moveDetail.isEnPassant) {
            san = `${fromAlg[0]}x${toAlg}`;
            if (moveDetail.isEnPassant) san += ' e.p.';
        } else {
            san = toAlg;
        }
        if (moveDetail.isPromotion) {
            san += `=${promotionPiece || 'Q'}`;
        }
    } else {
        san = pType;
        if (moveDetail.isCapture) {
            san += `x${toAlg}`;
        } else {
            san += toAlg;
        }
    }

    return san;
}

/**
 * Executes a move on the state
 */
function makeMove(state, fromSquare, toSquare, promotionPiece = 'Q') {
    if (fromSquare === 'dummy') {
        updateGameStatus(state);
        return;
    }

    const from = typeof fromSquare === 'string' ? algebraicToCoords(fromSquare) : fromSquare;
    const to = typeof toSquare === 'string' ? algebraicToCoords(toSquare) : toSquare;

    const piece = state.board[from.row][from.col];
    if (!piece) return { success: false, error: 'No piece at source square' };

    const color = piece[0] === 'w' ? 'white' : 'black';
    if (color !== state.turn) return { success: false, error: 'Not player turn' };

    const legalMoves = getLegalMovesForSquare(state, from.row, from.col);
    const move = legalMoves.find(m => m.row === to.row && m.col === to.col);

    if (!move) {
        return { success: false, error: 'Illegal move' };
    }

    const targetPiece = state.board[to.row][to.col];
    const capturedPiece = move.isEnPassant ? (color === 'white' ? 'bP' : 'wP') : targetPiece;

    if (capturedPiece) {
        state.captured[color].push(capturedPiece);
    }

    // Build SAN before updating board
    let san = toSAN(state, from, to, move, piece, promotionPiece);

    // Apply move
    let finalPiece = piece;
    if (move.isPromotion) {
        const promoType = ['Q', 'R', 'B', 'N'].includes(promotionPiece) ? promotionPiece : 'Q';
        finalPiece = (color === 'white' ? 'w' : 'b') + promoType;
    }

    state.board[to.row][to.col] = finalPiece;
    state.board[from.row][from.col] = null;

    // En Passant capture removal
    if (move.isEnPassant) {
        state.board[from.row][to.col] = null;
    }

    // Castling rook move
    if (move.isCastling === 'K') {
        state.board[from.row][5] = state.board[from.row][7];
        state.board[from.row][7] = null;
    } else if (move.isCastling === 'Q') {
        state.board[from.row][3] = state.board[from.row][0];
        state.board[from.row][0] = null;
    }

    // Update En Passant target
    if (move.isTwoStepPawn) {
        const stepDir = color === 'white' ? -1 : 1;
        state.enPassantTarget = { row: from.row + stepDir, col: from.col };
    } else {
        state.enPassantTarget = null;
    }

    // Update Castling Rights
    if (piece === 'wK') {
        state.castlingRights.white.kingSide = false;
        state.castlingRights.white.queenSide = false;
    } else if (piece === 'bK') {
        state.castlingRights.black.kingSide = false;
        state.castlingRights.black.queenSide = false;
    }

    if (piece === 'wR') {
        if (from.row === 7 && from.col === 0) state.castlingRights.white.queenSide = false;
        if (from.row === 7 && from.col === 7) state.castlingRights.white.kingSide = false;
    } else if (piece === 'bR') {
        if (from.row === 0 && from.col === 0) state.castlingRights.black.queenSide = false;
        if (from.row === 0 && from.col === 7) state.castlingRights.black.kingSide = false;
    }

    // If opponent rook is captured in corner
    if (to.row === 0 && to.col === 0) state.castlingRights.black.queenSide = false;
    if (to.row === 0 && to.col === 7) state.castlingRights.black.kingSide = false;
    if (to.row === 7 && to.col === 0) state.castlingRights.white.queenSide = false;
    if (to.row === 7 && to.col === 7) state.castlingRights.white.kingSide = false;

    // Switch turn
    state.turn = state.turn === 'white' ? 'black' : 'white';
    state.moveCount++;

    // Update game status (check / checkmate / stalemate)
    updateGameStatus(state);

    // Annotate SAN with check (+) or checkmate (#)
    if (state.status === 'checkmate') {
        san += '#';
    } else if (state.status === 'check') {
        san += '+';
    }

    // Record in history
    state.history.push({
        from: coordsToAlgebraic(from.row, from.col),
        to: coordsToAlgebraic(to.row, to.col),
        piece: piece,
        captured: capturedPiece,
        san: san,
        status: state.status
    });

    return {
        success: true,
        move: move,
        san: san,
        status: state.status,
        winner: state.winner
    };
}

/**
 * Calculates material values & material advantage
 */
function evaluateMaterial(captured) {
    let whiteScore = 0;
    let blackScore = 0;

    if (captured && captured.white) {
        for (const p of captured.white) {
            const type = p[1];
            whiteScore += PIECE_VALUES[type] || 0;
        }
    }
    if (captured && captured.black) {
        for (const p of captured.black) {
            const type = p[1];
            blackScore += PIECE_VALUES[type] || 0;
        }
    }

    return {
        whiteScore,
        blackScore,
        diff: whiteScore - blackScore // positive means white is ahead in material
    };
}

// Export for Node / CommonJS and Browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DEFAULT_BOARD,
        PIECE_SYMBOLS,
        PIECE_NAMES,
        PIECE_VALUES,
        coordsToAlgebraic,
        algebraicToCoords,
        isInsideBoard,
        cloneBoard,
        createInitialState,
        findKing,
        isSquareAttacked,
        isKingInCheck,
        getPseudoLegalMovesForSquare,
        getLegalMovesForSquare,
        getAllLegalMoves,
        updateGameStatus,
        makeMove,
        evaluateMaterial
    };
}
