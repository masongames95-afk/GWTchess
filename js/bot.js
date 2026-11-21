const ChessBot = (() => {
    const engine = typeof module !== 'undefined' && module.exports
        ? require('./engine.js')
        : { getAllLegalMoves, makeMove };
    const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
    const MATE = 100000;
    const TIMEOUT = Symbol('search timeout');

    function evaluate(state) {
        let score = 0;
        let nonPawnMaterial = 0;
        for (const row of state.board) {
            for (const piece of row) {
                if (piece && piece[1] !== 'P') nonPawnMaterial += VALUES[piece[1]];
            }
        }
        const endgame = nonPawnMaterial < 2600;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = state.board[r][c];
                if (!piece) continue;
                const white = piece[0] === 'w';
                const advance = white ? 6 - r : r - 1;
                const center = 7 - Math.abs(3.5 - r) - Math.abs(3.5 - c);
                let position = 0;
                switch (piece[1]) {
                    case 'P': position = advance * (endgame ? 16 : 8) + center * 5; break;
                    case 'N': position = center * 12; break;
                    case 'B': position = center * 7; break;
                    case 'R': position = advance * 2; break;
                    case 'Q': position = center * 3; break;
                    case 'K':
                        position = endgame ? center * 12 : -center * 8;
                        if (!endgame && r === (white ? 7 : 0) && (c === 2 || c === 6)) position += 40;
                        break;
                }
                score += (white ? 1 : -1) * (VALUES[piece[1]] + position);
            }
        }
        return state.turn === 'white' ? score : -score;
    }

    function movesFor(state) {
        return engine.getAllLegalMoves(state, state.turn).flatMap(move =>
            move.to.isPromotion
                ? ['Q', 'N', 'R', 'B'].map(promotionChoice => ({ ...move, promotionChoice }))
                : [{ ...move, promotionChoice: 'Q' }]
        );
    }

    function orderMoves(state, moves, preferred) {
        const priority = move => {
            if (preferred && move.from.row === preferred.from.row && move.from.col === preferred.from.col &&
                move.to.row === preferred.to.row && move.to.col === preferred.to.col &&
                move.promotionChoice === preferred.promotionChoice) return MATE;
            const target = state.board[move.to.row][move.to.col];
            const captured = move.to.isEnPassant ? VALUES.P : target ? VALUES[target[1]] : 0;
            return captured * 10 - (captured ? VALUES[state.board[move.from.row][move.from.col][1]] : 0) +
                (move.to.isPromotion ? VALUES[move.promotionChoice] : 0) + (move.to.isCastling ? 40 : 0);
        };
        return moves.sort((a, b) => priority(b) - priority(a));
    }

    function afterMove(state, move) {
        const next = {
            ...state,
            board: state.board.map(row => [...row]),
            castlingRights: {
                white: { ...state.castlingRights.white },
                black: { ...state.castlingRights.black }
            },
            captured: { white: [...state.captured.white], black: [...state.captured.black] },
            history: []
        };
        engine.makeMove(next, move.from, move.to, move.promotionChoice);
        return next;
    }

    function chooseMove(state, { timeLimitMs = 600, maxDepth = 4 } = {}) {
        const started = performance.now();
        const deadline = started + Math.max(1, Math.min(timeLimitMs, 1000));
        let nodes = 0;
        let completedDepth = 0;
        let bestMove = null;

        function search(position, depth, alpha, beta, ply, quietDepth = 4) {
            nodes++;
            if (performance.now() >= deadline) throw TIMEOUT;
            if (position.status === 'checkmate') return -MATE + ply;
            if (position.status === 'stalemate') return 0;

            const inCheck = position.status === 'check';
            if (depth <= 0) {
                const score = evaluate(position);
                if (quietDepth <= 0) return score;
                if (!inCheck) {
                    if (score >= beta) return score;
                    alpha = Math.max(alpha, score);
                }
            }

            let moves = movesFor(position);
            if (depth <= 0 && !inCheck) {
                moves = moves.filter(move => move.to.isCapture || move.to.isPromotion);
            }
            orderMoves(position, moves);
            for (const move of moves) {
                const score = -search(afterMove(position, move), depth - 1, -beta, -alpha, ply + 1,
                    depth <= 0 ? quietDepth - 1 : quietDepth);
                if (score >= beta) return score;
                alpha = Math.max(alpha, score);
            }
            return alpha;
        }

        if (state.status !== 'checkmate' && state.status !== 'stalemate') {
            const moves = orderMoves(state, movesFor(state));
            bestMove = moves[0] || null;
            for (let depth = 1; depth <= Math.min(maxDepth, 4) && moves.length; depth++) {
                let iterationBest = moves[0];
                let bestScore = -Infinity;
                orderMoves(state, moves, bestMove);
                try {
                    for (const move of moves) {
                        const score = -search(afterMove(state, move), depth - 1, -Infinity, -bestScore, 1);
                        if (score > bestScore) {
                            bestScore = score;
                            iterationBest = move;
                        }
                    }
                } catch (error) {
                    if (error !== TIMEOUT) throw error;
                    break;
                }
                bestMove = iterationBest;
                completedDepth = depth;
                if (bestScore >= MATE - 100) break;
            }
        }
        return { move: bestMove, depth: completedDepth, nodes, elapsedMs: performance.now() - started };
    }

    return { chooseMove };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ChessBot;
