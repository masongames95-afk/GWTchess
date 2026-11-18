<?php

declare(strict_types=1);

namespace Chess;

require_once __DIR__ . '/Storage.php';
require_once __DIR__ . '/Board.php';

class Game
{
    private Storage $storage;
    private array $state;

    public function __construct(?Storage $storage = null)
    {
        $this->storage = $storage ?? new Storage();
        $this->state = $this->storage->load();

        if (empty($this->state) || !isset($this->state['board'])) {
            $this->reset();
        }
    }

    public function getState(): array
    {
        return $this->state;
    }

    public function reset(): array
    {
        $this->state = [
            'id' => 'default',
            'turn' => 'white',
            'status' => 'active',
            'moveCount' => 0,
            'history' => [],
            'captured' => [
                'white' => [],
                'black' => [],
            ],
            'board' => Board::getInitialBoard(),
        ];

        $this->storage->save($this->state);
        return $this->state;
    }

    /**
     * Executes a move from algebraic square (e.g. 'e2') to 'e4'.
     */
    public function makeMove(string $from, string $to): array
    {
        $fromCoords = Board::notationToCoords($from);
        $toCoords = Board::notationToCoords($to);

        if (!$fromCoords || !$toCoords) {
            return [
                'success' => false,
                'error' => 'Invalid square coordinates.',
                'state' => $this->state,
            ];
        }

        $piece = $this->state['board'][$fromCoords['row']][$fromCoords['col']];
        if (!$piece) {
            return [
                'success' => false,
                'error' => 'No piece on source square.',
                'state' => $this->state,
            ];
        }

        $pieceColor = str_starts_with($piece, 'w') ? 'white' : 'black';
        if ($pieceColor !== $this->state['turn']) {
            return [
                'success' => false,
                'error' => "It is {$this->state['turn']}'s turn.",
                'state' => $this->state,
            ];
        }

        $target = $this->state['board'][$toCoords['row']][$toCoords['col']];
        if ($target) {
            $targetColor = str_starts_with($target, 'w') ? 'white' : 'black';
            if ($targetColor === $pieceColor) {
                return [
                    'success' => false,
                    'error' => 'Cannot capture own piece.',
                    'state' => $this->state,
                ];
            }
            $this->state['captured'][$pieceColor][] = $target;
        }

        // Apply move on the board
        $this->state['board'][$toCoords['row']][$toCoords['col']] = $piece;
        $this->state['board'][$fromCoords['row']][$fromCoords['col']] = null;

        // Update history and turn
        $this->state['history'][] = [
            'from' => $from,
            'to' => $to,
            'piece' => $piece,
            'captured' => $target,
        ];
        $this->state['moveCount']++;
        $this->state['turn'] = ($this->state['turn'] === 'white') ? 'black' : 'white';

        $this->storage->save($this->state);

        return [
            'success' => true,
            'state' => $this->state,
        ];
    }
}
