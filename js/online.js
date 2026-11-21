/**
 * Online Multiplayer Controller (Room Code Generation & Real-Time Sync)
 * Manages room creation, code sharing, room joining, Server-Sent Events (SSE),
 * player turns, board flipping, resignation, and live moves.
 */

class OnlineController {
    constructor() {
        this.activeRoom = null; // { code, color: 'white'|'black', status, white, black, gameState }
        this.eventSource = null;
        this.isOnlineMatch = false;

        // Overlay & Modal Elements
        this.overlay = document.getElementById('online-overlay');
        this.btnOpenOnline = document.getElementById('btn-open-online');
        this.btnCloseOnline = document.getElementById('btn-close-online');
        this.tabCreateRoom = document.getElementById('tab-create-room');
        this.tabJoinRoom = document.getElementById('tab-join-room');
        this.paneCreateRoom = document.getElementById('pane-create-room');
        this.paneJoinRoom = document.getElementById('pane-join-room');

        // Create Room Pane
        this.createRoomInitial = document.getElementById('create-room-initial');
        this.createRoomActive = document.getElementById('create-room-active');
        this.btnCreateRoomAction = document.getElementById('btn-create-room-action');
        this.createdRoomCode = document.getElementById('created-room-code');
        this.btnCopyCode = document.getElementById('btn-copy-code');
        this.btnCopyLink = document.getElementById('btn-copy-link');
        this.waitingRoomStatus = document.getElementById('waiting-room-status');

        // Join Room Pane
        this.formJoinRoom = document.getElementById('form-join-room');
        this.joinRoomCodeInput = document.getElementById('join-room-code-input');
        this.joinRoomError = document.getElementById('join-room-error');
        this.btnSubmitJoinRoom = document.getElementById('btn-submit-join-room');

        // Online Banner Elements
        this.onlineGameBanner = document.getElementById('online-game-banner');
        this.bannerRoomCode = document.getElementById('banner-room-code');
        this.bannerRoleBadge = document.getElementById('banner-role-badge');
        this.onlineStatusText = document.getElementById('online-status-text');
        this.btnOnlineResign = document.getElementById('btn-online-resign');
        this.btnOnlineLeave = document.getElementById('btn-online-leave');

        this.init();
    }

    init() {
        // Modal open/close
        if (this.btnOpenOnline) {
            this.btnOpenOnline.addEventListener('click', () => this.openModal());
        }
        if (this.btnCloseOnline) {
            this.btnCloseOnline.addEventListener('click', () => this.closeModal());
        }
        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) this.closeModal();
            });
        }

        // Tabs
        if (this.tabCreateRoom) {
            this.tabCreateRoom.addEventListener('click', () => this.switchTab('create'));
        }
        if (this.tabJoinRoom) {
            this.tabJoinRoom.addEventListener('click', () => this.switchTab('join'));
        }

        // Actions
        if (this.btnCreateRoomAction) {
            this.btnCreateRoomAction.addEventListener('click', () => this.handleCreateRoom());
        }
        if (this.btnCopyCode) {
            this.btnCopyCode.addEventListener('click', () => this.copyRoomCode());
        }
        if (this.btnCopyLink) {
            this.btnCopyLink.addEventListener('click', () => this.copyRoomLink());
        }
        if (this.formJoinRoom) {
            this.formJoinRoom.addEventListener('submit', (e) => this.handleJoinRoom(e));
        }

        // Auto-uppercase join code input
        if (this.joinRoomCodeInput) {
            this.joinRoomCodeInput.addEventListener('input', () => {
                this.joinRoomCodeInput.value = this.joinRoomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (this.joinRoomError) this.joinRoomError.classList.add('hidden');
            });
        }

        // Banner actions
        if (this.btnOnlineResign) {
            this.btnOnlineResign.addEventListener('click', () => this.handleResign());
        }
        if (this.btnOnlineLeave) {
            this.btnOnlineLeave.addEventListener('click', () => this.handleLeave());
        }

        // Check URL parameter (?room=ABC123)
        setTimeout(() => this.checkUrlRoomParam(), 400);
    }

    checkUrlRoomParam() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const roomCode = urlParams.get('room');
            if (roomCode && roomCode.trim()) {
                const code = roomCode.trim().toUpperCase();
                this.openModal('join');
                if (this.joinRoomCodeInput) {
                    this.joinRoomCodeInput.value = code;
                }
                if (typeof showMessage === 'function') {
                    showMessage(`Код комнаты ${code} загружен из ссылки. Нажмите "Присоединиться к игре".`);
                }
            }
        } catch (e) {
            console.warn('URL room check failed:', e);
        }
    }

    openModal(initialTab = 'create') {
        if (!window.authController || !window.authController.currentUser) {
            if (typeof showMessage === 'function') {
                showMessage('Для создания или входа в онлайн-игру необходимо войти в аккаунт.', true);
            }
            if (window.authController) {
                window.authController.openModal('login');
            }
            return;
        }

        this.switchTab(initialTab);
        if (this.overlay) {
            this.overlay.classList.remove('hidden');
        }
    }

    closeModal() {
        if (this.overlay) {
            this.overlay.classList.add('hidden');
        }
        if (this.joinRoomError) {
            this.joinRoomError.classList.add('hidden');
            this.joinRoomError.textContent = '';
        }
    }

    switchTab(tab) {
        if (tab === 'create') {
            this.tabCreateRoom.classList.add('active');
            this.tabJoinRoom.classList.remove('active');
            this.paneCreateRoom.classList.remove('hidden');
            this.paneJoinRoom.classList.add('hidden');
        } else {
            this.tabJoinRoom.classList.add('active');
            this.tabCreateRoom.classList.remove('active');
            this.paneJoinRoom.classList.remove('hidden');
            this.paneCreateRoom.classList.add('hidden');
            setTimeout(() => this.joinRoomCodeInput?.focus(), 100);
        }
    }

    async handleCreateRoom() {
        if (!window.authController || !window.authController.currentUser) {
            this.openModal();
            return;
        }

        try {
            this.btnCreateRoomAction.disabled = true;
            this.btnCreateRoomAction.textContent = '⏳ Создаем комнату...';

            const res = await fetch(`${API_BASE}/api/rooms/create`, {
                method: 'POST',
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' })
            });

            const data = await res.json();
            this.btnCreateRoomAction.disabled = false;
            this.btnCreateRoomAction.textContent = '✨ Сгенерировать код комнаты';

            if (!res.ok) {
                if (typeof showMessage === 'function') {
                    showMessage('Ошибка создания комнаты: ' + (data.error || 'Неизвестная ошибка'), true);
                }
                return;
            }

            const roomData = data.room;
            this.activeRoom = {
                code: roomData.code,
                color: roomData.color,
                status: 'waiting',
                white: window.authController.currentUser.username,
                black: null,
                gameState: roomData.room.gameState
            };

            // Display generated room code
            if (this.createdRoomCode) {
                this.createdRoomCode.textContent = roomData.code;
            }
            if (this.createRoomInitial) this.createRoomInitial.classList.add('hidden');
            if (this.createRoomActive) this.createRoomActive.classList.remove('hidden');

            if (typeof showMessage === 'function') {
                showMessage(`Комната ${roomData.code} создана! Ожидаем соперника...`);
            }

            // Connect to SSE stream to wait for opponent
            this.connectSSE(roomData.code, 'white');
        } catch (err) {
            console.error('Create room error:', err);
            this.btnCreateRoomAction.disabled = false;
            this.btnCreateRoomAction.textContent = '✨ Сгенерировать код комнаты';
            if (typeof showMessage === 'function') {
                showMessage('Ошибка соединения с сервером при создании комнаты.', true);
            }
        }
    }

    copyRoomCode() {
        if (!this.activeRoom || !this.activeRoom.code) return;
        navigator.clipboard.writeText(this.activeRoom.code).then(() => {
            this.btnCopyCode.textContent = '✓ Скопировано!';
            setTimeout(() => {
                if (this.btnCopyCode) this.btnCopyCode.textContent = '📋 Копировать код';
            }, 2000);
        }).catch(err => {
            console.warn('Clipboard copy error:', err);
        });
    }

    copyRoomLink() {
        if (!this.activeRoom || !this.activeRoom.code) return;
        const link = `${window.location.origin}${window.location.pathname}?room=${this.activeRoom.code}`;
        navigator.clipboard.writeText(link).then(() => {
            this.btnCopyLink.textContent = '✓ Ссылка скопирована!';
            setTimeout(() => {
                if (this.btnCopyLink) this.btnCopyLink.textContent = '🔗 Скопировать ссылку на партию';
            }, 2000);
        }).catch(err => {
            console.warn('Clipboard link copy error:', err);
        });
    }

    async handleJoinRoom(e) {
        e.preventDefault();
        const code = (this.joinRoomCodeInput.value || '').trim().toUpperCase();

        if (!code || code.length < 3) {
            this.showJoinError('Введите корректный код комнаты.');
            return;
        }

        try {
            this.btnSubmitJoinRoom.disabled = true;
            this.btnSubmitJoinRoom.textContent = '⏳ Подключение...';

            const res = await fetch(`${API_BASE}/api/rooms/join`, {
                method: 'POST',
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ code })
            });

            const data = await res.json();
            this.btnSubmitJoinRoom.disabled = false;
            this.btnSubmitJoinRoom.textContent = '🚀 Присоединиться к игре';

            if (!res.ok) {
                this.showJoinError(data.error || 'Ошибка входа в комнату.');
                return;
            }

            // Successful join
            this.closeModal();
            this.activeRoom = {
                code: data.code,
                color: data.color,
                status: data.status,
                white: data.room.white,
                black: data.room.black,
                gameState: data.room.gameState
            };

            this.startOnlineMatch(this.activeRoom);
            this.connectSSE(data.code, data.color);
        } catch (err) {
            console.error('Join room error:', err);
            this.btnSubmitJoinRoom.disabled = false;
            this.btnSubmitJoinRoom.textContent = '🚀 Присоединиться к игре';
            this.showJoinError('Ошибка связи с сервером.');
        }
    }

    showJoinError(msg) {
        if (!this.joinRoomError) return;
        this.joinRoomError.textContent = msg;
        this.joinRoomError.classList.remove('hidden');
    }

    connectSSE(code, myColor) {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        const token = localStorage.getItem('chess_auth_token') || '';
        const streamUrl = `${API_BASE}/api/rooms/${code}/events?token=${encodeURIComponent(token)}`;

        this.eventSource = new EventSource(streamUrl, {
            withCredentials: !isFileProtocol
        });

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerEvent(data);
            } catch (err) {
                console.error('SSE JSON parse error:', err);
            }
        };

        this.eventSource.onerror = (err) => {
            console.warn('SSE stream notice/reconnecting:', err);
        };
    }

    handleServerEvent(data) {
        if (!data || !data.type) return;

        // 1. Initial Sync
        if (data.type === 'sync') {
            const room = data.room;
            if (room && room.status === 'playing') {
                this.activeRoom = {
                    code: room.code,
                    color: room.myColor || (this.activeRoom ? this.activeRoom.color : 'white'),
                    status: room.status,
                    white: room.white,
                    black: room.black,
                    gameState: room.gameState
                };
                this.startOnlineMatch(this.activeRoom);
            }
            return;
        }

        // 2. Opponent connected -> Match Starts!
        if (data.type === 'room_start') {
            if (typeof audio !== 'undefined' && audio.playMove) {
                audio.playMove();
            }

            this.activeRoom = {
                code: data.code,
                color: (this.activeRoom && this.activeRoom.color) ? this.activeRoom.color : 'white',
                status: 'playing',
                white: data.white,
                black: data.black,
                gameState: data.gameState
            };

            this.closeModal();
            this.startOnlineMatch(this.activeRoom);

            if (typeof showMessage === 'function') {
                const oppName = this.activeRoom.color === 'white' ? data.black : data.white;
                showMessage(`Соперник ${oppName} подключился! Игра началась!`);
            }
            return;
        }

        // 3. Move Event from server
        if (data.type === 'move') {
            if (typeof gameState !== 'undefined') {
                gameState = data.gameState;
            }

            if (this.activeRoom) {
                this.activeRoom.gameState = data.gameState;
                this.activeRoom.status = data.gameState.status === 'checkmate' || data.gameState.status === 'stalemate'
                    ? 'finished'
                    : 'playing';
            }
            if (this.activeRoom?.status === 'finished' && this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }

            // Play appropriate sound
            if (typeof audio !== 'undefined') {
                if (data.status === 'checkmate') audio.playGameOver();
                else if (data.status === 'check') audio.playCheck();
                else audio.playMove();
            }

            // Update UI render
            if (typeof render === 'function') {
                render();
            }
            this.updateBannerStatus();

            // Check game over
            if (data.status === 'checkmate') {
                const isIWinner = (data.winner === this.activeRoom.color);
                const title = isIWinner ? '🏆 Победа!' : 'Мат! Поражение';
                const desc = isIWinner
                    ? `Вы поставили мат сопернику (${data.winner === 'white' ? 'Белые' : 'Черные'})!`
                    : `Вам поставили мат. Победили ${data.winner === 'white' ? 'Белые' : 'Черные'}.`;

                if (typeof openGameOverModal === 'function') {
                    openGameOverModal(title, desc);
                }
                if (typeof showMessage === 'function') {
                    showMessage(`МАТ! Победили ${data.winner === 'white' ? 'Белые' : 'Черные'}!`);
                }
                if (window.authController) {
                    window.authController.loadProfileData();
                }
            } else if (data.status === 'stalemate') {
                if (typeof openGameOverModal === 'function') {
                    openGameOverModal('🤝 Пат! Ничья', 'Партия завершилась ничьей.');
                }
                if (window.authController) {
                    window.authController.loadProfileData();
                }
            } else if (data.status === 'check') {
                if (typeof showMessage === 'function') {
                    showMessage(`Ход ${data.san}. Внимание: ШАХ!`);
                }
            } else {
                if (typeof showMessage === 'function') {
                    showMessage(`Сделан ход: ${data.san}`);
                }
            }
            return;
        }

        // 4. Game Over (e.g. Resignation)
        if (data.type === 'game_over') {
            if (this.activeRoom) {
                this.activeRoom.status = 'finished';
            }
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
            this.updateBannerStatus();

            const winnerColor = data.winner;
            const isIWinner = (winnerColor === this.activeRoom.color);
            const winnerName = isIWinner ? 'Вы победили!' : 'Вы проиграли';
            const reasonDesc = data.reason === 'resignation'
                ? `Игрок ${data.resignedBy} сдался.`
                : 'Партия завершена.';

            if (typeof audio !== 'undefined' && audio.playGameOver) {
                audio.playGameOver();
            }

            if (typeof openGameOverModal === 'function') {
                openGameOverModal(`${isIWinner ? '🏆 ' : ''}${winnerName}`, reasonDesc);
            }

            if (typeof showMessage === 'function') {
                showMessage(`${winnerName} (${reasonDesc})`);
            }

            if (window.authController) {
                window.authController.loadProfileData();
            }
        }
    }

    startOnlineMatch(roomData) {
        this.isOnlineMatch = true;
        this.activeRoom = roomData;

        // Apply game state to global engine
        if (typeof gameState !== 'undefined') {
            gameState = roomData.gameState;
        }

        // Show banner
        if (this.onlineGameBanner) {
            this.onlineGameBanner.classList.remove('hidden');
        }
        if (this.bannerRoomCode) {
            this.bannerRoomCode.textContent = roomData.code;
        }
        if (this.bannerRoleBadge) {
            this.bannerRoleBadge.textContent = roomData.color === 'white' ? '⚪ Вы: Белые' : '⚫ Вы: Черные';
        }

        // Update player bar labels
        const nameTopEl = document.getElementById('name-top');
        const nameBottomEl = document.getElementById('name-bottom');
        const myName = window.authController?.currentUser?.username || 'Вы';
        const opponentName = (roomData.color === 'white' ? roomData.black : roomData.white) || 'Ожидание соперника...';

        if (nameBottomEl) nameBottomEl.textContent = `${myName} (${roomData.color === 'white' ? 'Белые' : 'Черные'})`;
        if (nameTopEl) nameTopEl.textContent = `${opponentName} (${roomData.color === 'white' ? 'Черные' : 'Белые'})`;

        // Automatically orient board: if player is Black, flip the board so player pieces are at bottom
        if (roomData.color === 'black' && typeof isFlipped !== 'undefined' && !isFlipped) {
            isFlipped = true;
        } else if (roomData.color === 'white' && typeof isFlipped !== 'undefined' && isFlipped) {
            isFlipped = false;
        }

        this.updateBannerStatus();

        if (typeof render === 'function') {
            render();
        }
    }

    updateBannerStatus() {
        if (!this.onlineStatusText || !this.activeRoom) return;

        if (this.activeRoom.status === 'waiting') {
            this.onlineStatusText.textContent = '⏳ Ожидание подключения соперника...';
            return;
        }

        if (this.activeRoom.status === 'finished') {
            this.onlineStatusText.textContent = '🏁 Партия завершена';
            return;
        }

        const isMyTurn = (gameState.turn === this.activeRoom.color);
        if (isMyTurn) {
            this.onlineStatusText.textContent = '🟢 Ваш ход!';
            this.onlineStatusText.style.color = '#4ade80';
        } else {
            this.onlineStatusText.textContent = '⏳ Ход соперника...';
            this.onlineStatusText.style.color = '#cbd5e1';
        }
    }

    canMoveSquare(r, c) {
        if (!this.isOnlineMatch || !this.activeRoom) return true; // Offline mode: any move allowed

        if (this.activeRoom.status !== 'playing') {
            if (this.activeRoom.status === 'waiting') {
                if (typeof showMessage === 'function') showMessage('Ожидайте подключения второго игрока.', true);
            } else {
                if (typeof showMessage === 'function') showMessage('Партия уже завершена.', true);
            }
            return false;
        }

        // Must be user's turn
        if (gameState.turn !== this.activeRoom.color) {
            if (typeof showMessage === 'function') {
                showMessage(`Сейчас ход соперника! Ожидайте своего хода.`, true);
            }
            return false;
        }

        return true;
    }

    async sendMoveToServer(from, to, promotionChoice = 'Q') {
        if (!this.isOnlineMatch || !this.activeRoom) return null;

        try {
            const res = await fetch(`${API_BASE}/api/rooms/${this.activeRoom.code}/move`, {
                method: 'POST',
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ from, to, promotionChoice })
            });

            const data = await res.json();
            if (!res.ok) {
                if (typeof showMessage === 'function') {
                    showMessage(data.error || 'Ошибка выполнения хода.', true);
                }
                return false;
            }
            return true;
        } catch (err) {
            console.error('Send move error:', err);
            if (typeof showMessage === 'function') {
                showMessage('Ошибка отправки хода на сервер.', true);
            }
            return false;
        }
    }

    async handleResign() {
        if (!this.isOnlineMatch || !this.activeRoom) return;
        if (this.activeRoom.status !== 'playing') {
            if (typeof showMessage === 'function') showMessage('Партия не активна.');
            return;
        }

        const confirmResign = confirm('Вы действительно хотите сдаться в этой партии?');
        if (!confirmResign) return;

        try {
            const res = await fetch(`${API_BASE}/api/rooms/${this.activeRoom.code}/resign`, {
                method: 'POST',
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' })
            });

            const data = await res.json();
            if (!res.ok) {
                if (typeof showMessage === 'function') {
                    showMessage(data.error || 'Не удалось сдаться.', true);
                }
            }
        } catch (err) {
            console.error('Resign error:', err);
        }
    }

    handleLeave() {
        if (!this.isOnlineMatch) return;

        const confirmLeave = confirm('Покинуть онлайн-игру и вернуться к локальному режиму?');
        if (!confirmLeave) return;

        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        this.isOnlineMatch = false;
        this.activeRoom = null;

        if (this.onlineGameBanner) {
            this.onlineGameBanner.classList.add('hidden');
        }

        // Reset player names to defaults
        const nameTopEl = document.getElementById('name-top');
        const nameBottomEl = document.getElementById('name-bottom');
        if (nameTopEl) nameTopEl.textContent = 'Черные';
        if (nameBottomEl) nameBottomEl.textContent = 'Белые';

        if (typeof resetGame === 'function') {
            // Optional reset or leave current board
            if (typeof showMessage === 'function') {
                showMessage('Вы вышли из онлайн-комнаты. Включен локальный режим.');
            }
        }
    }
}

// Global instance initialized on DOM ready
let onlineController = null;
document.addEventListener('DOMContentLoaded', () => {
    onlineController = new OnlineController();
    window.onlineController = onlineController;
});
