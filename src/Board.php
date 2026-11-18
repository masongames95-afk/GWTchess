<?php

declare(strict_types=1);

namespace Chess;

class Board
{
    /**
     * Returns standard initial 8x8 chessboard matrix.
     */
    public static function getInitialBoard(): array
    {
        return [
            ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
            ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
            ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'],
        ];
    }

    /**
     * Converts algebraic notation (e.g. 'e4') to matrix coordinates [row, col].
     */
    public static function notationToCoords(string $square): ?array
    {
        if (strlen($square) !== 2) {
            return null;
        }

        $col = ord(strtolower($square[0])) - ord('a');
        $row = 8 - (int)$square[1];

        if ($col < 0 || $col > 7 || $row < 0 || $row > 7) {
            return null;
        }

        return ['row' => $row, 'col' => $col];
    }

    /**
     * Converts matrix coordinates [row, col] to algebraic notation (e.g. 'e4').
     */
    public static function coordsToNotation(int $row, int $col): ?string
    {
        if ($row < 0 || $row > 7 || $col < 0 || $col > 7) {
            return null;
        }

        return chr(ord('a') + $col) . (8 - $row);
    }
}
