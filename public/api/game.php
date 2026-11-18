<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once dirname(__DIR__, 2) . '/src/Game.php';

use Chess\Game;

try {
    $game = new Game();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        echo json_encode([
            'success' => true,
            'state' => $game->getState(),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $rawInput = file_get_contents('php://input');
        $data = json_decode($rawInput, true);

        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Invalid JSON payload.',
            ]);
            exit;
        }

        $action = $data['action'] ?? 'move';

        if ($action === 'reset') {
            $state = $game->reset();
            echo json_encode([
                'success' => true,
                'state' => $state,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'move') {
            $from = (string)($data['from'] ?? '');
            $to = (string)($data['to'] ?? '');

            if (!$from || !$to) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => 'Missing "from" or "to" square parameter.',
                ]);
                exit;
            }

            $result = $game->makeMove($from, $to);
            if (!$result['success']) {
                http_response_code(422);
            }

            echo json_encode($result, JSON_UNESCAPED_UNICODE);
            exit;
        }

        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Unknown action.',
        ]);
        exit;
    }

    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error' => 'Method not allowed.',
    ]);
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage(),
    ]);
}
