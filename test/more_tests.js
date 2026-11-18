const {
    createInitialState,
    getLegalMovesForSquare,
    getAllLegalMoves,
    makeMove,
    isKingInCheck,
    coordsToAlgebraic,
    algebraicToCoords
} = require('../js/engine.js');

function assert(condition, message) {
    if (!condition) {
        console.error('FAIL:', message);
        process.exit(1);
    } else {
        console.log('PASS:', message);
    }
}

console.log('--- TEST: Scholar\'s Mate ---');
// 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#
let state = createInitialState();
makeMove(state, 'e2', 'e4');
makeMove(state, 'e7', 'e5');
makeMove(state, 'd1', 'h5');
makeMove(state, 'b8', 'c6');
makeMove(state, 'f1', 'c4');
makeMove(state, 'g8', 'f6');
const finalMove = makeMove(state, 'h5', 'f7');

assert(finalMove.san === 'Qxf7#', 'SAN is Qxf7#');
assert(state.status === 'checkmate', 'Status is checkmate');
assert(state.winner === 'white', 'White is winner');
assert(isKingInCheck(state.board, 'black'), 'Black king is in check');
assert(getAllLegalMoves(state, 'black').length === 0, 'Black has 0 legal moves');

console.log('\n--- TEST: En Passant Expiration ---');
// En passant is ONLY valid on the very next move. If not taken, it expires.
state = createInitialState();
makeMove(state, 'e2', 'e4');
makeMove(state, 'a7', 'a6');
makeMove(state, 'e4', 'e5');
makeMove(state, 'd7', 'd5'); // gives en passant target d6
assert(state.enPassantTarget !== null, 'En passant target set');

// White plays h2-h3 instead of taking en passant
makeMove(state, 'h2', 'h3');
assert(state.enPassantTarget === null, 'En passant target reset after other move');

// Black plays h7-h6
makeMove(state, 'h7', 'h6');

// Now white e5 pawn cannot move to d6
const e5Moves = getLegalMovesForSquare(state, 3, 4);
assert(!e5Moves.some(m => coordsToAlgebraic(m.row, m.col) === 'd6'), 'Cannot play en passant on later turns');

console.log('\n--- TEST: Promotion choices ---');
// Test promoting to Knight (Underpromotion)
state = createInitialState();
for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) state.board[r][c] = null;
}
state.board[7][4] = 'wK';
state.board[0][4] = 'bK';
state.board[1][0] = 'wP'; // a7
state.turn = 'white';

const a7Moves = getLegalMovesForSquare(state, 1, 0);
assert(a7Moves.some(m => m.isPromotion), 'Pawn move to a8 flagged as promotion');

makeMove(state, 'a7', 'a8', 'N');
assert(state.board[0][0] === 'wN', 'Pawn successfully promoted to Knight');

console.log('\n--- TEST: Discovered & Double Check ---');
// White King at h1, Black King at a8. White Bishop at e4, White Rook at e1.
// Black King at e8. Moving Bishop to c6 gives double check from Bishop and Rook!
state = createInitialState();
for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) state.board[r][c] = null;
}
state.board[7][7] = 'wK'; // h1
state.board[0][4] = 'bK'; // e8
state.board[7][4] = 'wR'; // e1
state.board[4][4] = 'wB'; // e4
state.turn = 'white';

// Move Bishop to g6 (discovered check on e-file from Rook and direct check from Bishop)
makeMove(state, 'e4', 'g6');
assert(state.status === 'check', 'Double check detected');
assert(isKingInCheck(state.board, 'black'), 'Black king is in check');

// In double check, ONLY king moves are legal (no blocking or capturing one piece can stop both)
// Let's add a black rook at a8 to test if it can intervene
state.board[0][0] = 'bR';
const blackRookMoves = getLegalMovesForSquare(state, 0, 0);
assert(blackRookMoves.length === 0, 'Black rook cannot move during double check');

const blackKingMoves = getLegalMovesForSquare(state, 0, 4);
assert(blackKingMoves.length > 0, 'Black king can still move away');

console.log('\nALL EXTENDED TESTS PASSED!');
