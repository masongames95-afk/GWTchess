<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Шахматы в браузере (PHP + JSON)</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <div class="app-container">
        <header class="app-header">
            <h1>Браузерные шахматы</h1>
            <div class="status-bar">
                <span id="turn-indicator" class="badge">Ход: <strong>Белые</strong></span>
                <span id="move-count" class="badge">Ходов: <strong>0</strong></span>
            </div>
        </header>

        <main class="game-layout">
            <section class="board-wrapper">
                <div id="chessboard" class="chessboard" aria-label="Шахматная доска"></div>
            </section>

            <aside class="sidebar">
                <div class="card controls-card">
                    <h2>Управление</h2>
                    <button id="btn-reset" class="btn btn-danger">Новая игра (Сброс)</button>
                    <div id="message-box" class="message-box"></div>
                </div>

                <div class="card history-card">
                    <h2>История ходов</h2>
                    <ol id="move-history" class="history-list"></ol>
                </div>

                <div class="card captured-card">
                    <h2>Взятые фигуры</h2>
                    <div class="captured-group">
                        <span class="label">Белыми:</span>
                        <div id="captured-by-white" class="captured-pieces"></div>
                    </div>
                    <div class="captured-group">
                        <span class="label">Черными:</span>
                        <div id="captured-by-black" class="captured-pieces"></div>
                    </div>
                </div>
            </aside>
        </main>
    </div>

    <script src="js/app.js"></script>
</body>
</html>
