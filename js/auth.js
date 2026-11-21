/**
 * Authentication & Database Sync Controller
 * Manages user registration, login, live account existence checking,
 * session cookies / tokens, cloud game saves and stats in the JSON database.
 */

const isFileProtocol = window.location.protocol === 'file:';
const API_BASE = (isFileProtocol || (window.location.port && window.location.port !== '3000'))
    ? 'http://localhost:3000'
    : '';

function getAuthHeaders(additional = {}) {
    const headers = { ...additional };
    const token = localStorage.getItem('chess_auth_token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

class AuthController {
    constructor() {
        this.currentUser = null;
        this.checkDebounceTimer = null;

        // Elements
        this.overlay = document.getElementById('auth-overlay');
        this.btnOpenAuth = document.getElementById('btn-open-auth');
        this.btnCloseAuth = document.getElementById('btn-close-auth');
        this.tabLogin = document.getElementById('tab-login');
        this.tabRegister = document.getElementById('tab-register');
        this.formLogin = document.getElementById('form-login');
        this.formRegister = document.getElementById('form-register');

        // Login inputs
        this.loginUsername = document.getElementById('login-username');
        this.loginPassword = document.getElementById('login-password');
        this.loginError = document.getElementById('login-error');

        // Register inputs
        this.registerUsername = document.getElementById('register-username');
        this.registerPassword = document.getElementById('register-password');
        this.registerPasswordConfirm = document.getElementById('register-password-confirm');
        this.registerError = document.getElementById('register-error');
        this.registerSuccess = document.getElementById('register-success');
        this.usernameCheckIndicator = document.getElementById('username-check-indicator');
        this.usernameCheckMsg = document.getElementById('username-check-msg');

        // Header user badge elements
        this.userBadge = document.getElementById('user-badge');
        this.userDisplayName = document.getElementById('user-display-name');
        this.userStatsPill = document.getElementById('user-stats-pill');
        this.userInfoClickable = document.getElementById('user-info-clickable');
        this.btnOpenProfile = document.getElementById('btn-open-profile');
        this.btnCloudSave = document.getElementById('btn-cloud-save');
        this.btnLogout = document.getElementById('btn-logout');

        // Profile Modal elements
        this.profileOverlay = document.getElementById('profile-overlay');
        this.btnCloseProfile = document.getElementById('btn-close-profile');
        this.profileUsername = document.getElementById('profile-username');
        this.profileCreatedDate = document.getElementById('profile-created-date');
        this.statWinsNum = document.getElementById('stat-wins-num');
        this.statLossesNum = document.getElementById('stat-losses-num');
        this.statDrawsNum = document.getElementById('stat-draws-num');
        this.statWinrateNum = document.getElementById('stat-winrate-num');
        this.profileGamesCount = document.getElementById('profile-games-count');
        this.profileGamesList = document.getElementById('profile-games-list');

        this.init();
    }

    init() {
        // Modal toggling
        if (this.btnOpenAuth) {
            this.btnOpenAuth.addEventListener('click', () => this.openModal('login'));
        }
        if (this.btnCloseAuth) {
            this.btnCloseAuth.addEventListener('click', () => this.closeModal());
        }
        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) this.closeModal();
            });
        }

        // Tabs
        if (this.tabLogin) {
            this.tabLogin.addEventListener('click', () => this.switchTab('login'));
        }
        if (this.tabRegister) {
            this.tabRegister.addEventListener('click', () => this.switchTab('register'));
        }

        // Live username check in registration form
        if (this.registerUsername) {
            this.registerUsername.addEventListener('input', () => {
                clearTimeout(this.checkDebounceTimer);
                const username = this.registerUsername.value.trim();
                if (!username) {
                    this.setCheckStatus('', '');
                    return;
                }
                this.setCheckStatus('checking', '⏳ Проверка...');
                this.checkDebounceTimer = setTimeout(() => {
                    this.checkUsernameAvailability(username);
                }, 300);
            });
        }

        // Form submissions
        if (this.formLogin) {
            this.formLogin.addEventListener('submit', (e) => this.handleLogin(e));
        }
        if (this.formRegister) {
            this.formRegister.addEventListener('submit', (e) => this.handleRegister(e));
        }

        // Logout
        if (this.btnLogout) {
            this.btnLogout.addEventListener('click', () => this.handleLogout());
        }

        // Cloud save
        if (this.btnCloudSave) {
            this.btnCloudSave.addEventListener('click', () => this.handleCloudSave());
        }

        // Profile modal opening
        if (this.btnOpenProfile) {
            this.btnOpenProfile.addEventListener('click', () => this.openProfileModal());
        }
        if (this.userInfoClickable) {
            this.userInfoClickable.addEventListener('click', () => this.openProfileModal());
        }
        if (this.btnCloseProfile) {
            this.btnCloseProfile.addEventListener('click', () => this.closeProfileModal());
        }
        if (this.profileOverlay) {
            this.profileOverlay.addEventListener('click', (e) => {
                if (e.target === this.profileOverlay) this.closeProfileModal();
            });
        }

        // Initial session check
        this.checkSession();
    }

    openModal(initialTab = 'login') {
        this.switchTab(initialTab);
        this.overlay.classList.remove('hidden');
        if (initialTab === 'login') {
            setTimeout(() => this.loginUsername?.focus(), 100);
        } else {
            setTimeout(() => this.registerUsername?.focus(), 100);
        }
    }

    closeModal() {
        this.overlay.classList.add('hidden');
        this.clearErrors();
    }

    switchTab(tab) {
        this.clearErrors();
        if (tab === 'login') {
            this.tabLogin.classList.add('active');
            this.tabRegister.classList.remove('active');
            this.formLogin.classList.remove('hidden');
            this.formRegister.classList.add('hidden');
        } else {
            this.tabRegister.classList.add('active');
            this.tabLogin.classList.remove('active');
            this.formRegister.classList.remove('hidden');
            this.formLogin.classList.add('hidden');
            if (this.registerUsername.value.trim()) {
                this.checkUsernameAvailability(this.registerUsername.value.trim());
            }
        }
    }

    clearErrors() {
        if (this.loginError) {
            this.loginError.textContent = '';
            this.loginError.classList.add('hidden');
        }
        if (this.registerError) {
            this.registerError.textContent = '';
            this.registerError.classList.add('hidden');
        }
        if (this.registerSuccess) {
            this.registerSuccess.textContent = '';
            this.registerSuccess.classList.add('hidden');
        }
    }

    setCheckStatus(status, message) {
        if (!this.usernameCheckIndicator || !this.usernameCheckMsg) return;

        this.usernameCheckIndicator.className = 'check-indicator ' + (status ? 'status-' + status : '');
        this.usernameCheckMsg.className = 'field-msg ' + (status ? 'status-' + status : '');
        this.usernameCheckMsg.textContent = message;

        if (status === 'ok') {
            this.usernameCheckIndicator.textContent = '✓';
        } else if (status === 'error') {
            this.usernameCheckIndicator.textContent = '✗';
        } else if (status === 'checking') {
            this.usernameCheckIndicator.textContent = '…';
        } else {
            this.usernameCheckIndicator.textContent = '';
        }
    }

    async checkUsernameAvailability(username) {
        try {
            const res = await fetch(`${API_BASE}/api/auth/check-username?username=${encodeURIComponent(username)}`, {
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders()
            });
            const data = await res.json();

            if (!data.valid) {
                this.setCheckStatus('warn', data.message);
            } else if (data.exists) {
                this.setCheckStatus('error', '✗ Аккаунт с таким именем уже существует');
            } else {
                this.setCheckStatus('ok', '✓ Имя пользователя свободно');
            }
            return data;
        } catch (err) {
            console.error('Check username error:', err);
            this.setCheckStatus('error', '⚠️ Сервер базы данных не запущен. Выполните npm start');
            return null;
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        this.clearErrors();

        const username = this.loginUsername.value.trim();
        const password = this.loginPassword.value;

        if (!username || !password) {
            this.showLoginError('Заполните все поля.');
            return;
        }

        try {
            const submitBtn = document.getElementById('btn-submit-login');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Вход...';

            const res = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            submitBtn.disabled = false;
            submitBtn.textContent = 'Войти в аккаунт';

            if (!res.ok) {
                if (data.code === 'USER_NOT_FOUND') {
                    this.showLoginError(
                        `Пользователь "${username}" не найден в базе данных. Проверьте правильность логина или перейдите на вкладку "Регистрация".`
                    );
                } else if (data.code === 'INVALID_PASSWORD') {
                    this.showLoginError('Неверный пароль. Попробуйте еще раз.');
                } else {
                    this.showLoginError(data.error || 'Ошибка входа.');
                }
                return;
            }

            this.onLoginSuccess(data.user, data.token, data.message);
        } catch (err) {
            console.error('Login error:', err);
            const isFile = window.location.protocol === 'file:';
            this.showLoginError(
                'Ошибка связи с сервером базы данных. ' +
                (isFile ? 'Запустите в терминале npm start и откройте игру по адресу: http://localhost:3000' : 'Убедитесь, что сервер запущен (npm start).')
            );
            const submitBtn = document.getElementById('btn-submit-login');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Войти в аккаунт';
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        this.clearErrors();

        const username = this.registerUsername.value.trim();
        const password = this.registerPassword.value;
        const confirm = this.registerPasswordConfirm.value;

        if (!username || !password || !confirm) {
            this.showRegisterError('Заполните все обязательные поля.');
            return;
        }

        if (password !== confirm) {
            this.showRegisterError('Пароли не совпадают.');
            return;
        }

        if (password.length < 4) {
            this.showRegisterError('Пароль должен быть не менее 4 символов.');
            return;
        }

        try {
            const submitBtn = document.getElementById('btn-submit-register');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Создание...';

            const res = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            submitBtn.disabled = false;
            submitBtn.textContent = 'Создать аккаунт';

            if (!res.ok) {
                this.showRegisterError(data.error || 'Ошибка регистрации.');
                return;
            }

            if (this.registerSuccess) {
                this.registerSuccess.textContent = `Аккаунт успешно создан и сохранен в БД!`;
                this.registerSuccess.classList.remove('hidden');
            }

            setTimeout(() => {
                this.onLoginSuccess(data.user, data.token, `Добро пожаловать в игру, ${data.user.username}!`);
            }, 600);
        } catch (err) {
            console.error('Register error:', err);
            const isFile = window.location.protocol === 'file:';
            this.showRegisterError(
                'Ошибка связи с сервером базы данных. ' +
                (isFile ? 'Запустите в терминале npm start и откройте игру по адресу: http://localhost:3000' : 'Убедитесь, что сервер запущен (npm start).')
            );
            const submitBtn = document.getElementById('btn-submit-register');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Создать аккаунт';
        }
    }

    showLoginError(msg) {
        if (!this.loginError) return;
        this.loginError.textContent = msg;
        this.loginError.classList.remove('hidden');
    }

    showRegisterError(msg) {
        if (!this.registerError) return;
        this.registerError.textContent = msg;
        this.registerError.classList.remove('hidden');
    }

    onLoginSuccess(user, token, message = '') {
        this.currentUser = user;
        if (token) {
            localStorage.setItem('chess_auth_token', token);
        }
        this.closeModal();
        this.updateUserUI();

        if (typeof showMessage === 'function') {
            showMessage(message || `Вы вошли как ${user.username}`);
        }

        // Check if user has saved game and prompt to load
        if (user.savedGame && user.savedGame.state) {
            if (typeof showMessage === 'function') {
                showMessage(`У вас есть сохраненная партия от ${new Date(user.savedGame.savedAt).toLocaleString()}.`);
            }
        }
    }

    async checkSession() {
        try {
            const res = await fetch(`${API_BASE}/api/auth/me`, {
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                if (data.authenticated && data.user) {
                    this.currentUser = data.user;
                    this.updateUserUI();
                } else {
                    this.currentUser = null;
                    this.updateUserUI();
                }
            }
        } catch (err) {
            console.warn('Backend server not connected or static mode:', err.message);
            this.currentUser = null;
            this.updateUserUI();
        }
    }

    updateUserUI() {
        if (this.currentUser) {
            if (this.btnOpenAuth) this.btnOpenAuth.classList.add('hidden');
            if (this.userBadge) this.userBadge.classList.remove('hidden');
            if (this.userDisplayName) this.userDisplayName.textContent = this.currentUser.username;

            const stats = this.currentUser.stats || { wins: 0, losses: 0, draws: 0 };
            if (this.userStatsPill) {
                this.userStatsPill.textContent = `${stats.wins} В • ${stats.losses} П • ${stats.draws} Н`;
                this.userStatsPill.title = `Статистика: ${stats.wins} побед, ${stats.losses} поражений, ${stats.draws} ничьих (всего ${stats.total || 0} игр)`;
            }
        } else {
            if (this.btnOpenAuth) this.btnOpenAuth.classList.remove('hidden');
            if (this.userBadge) this.userBadge.classList.add('hidden');
        }
    }

    async handleLogout() {
        try {
            await fetch(`${API_BASE}/api/auth/logout`, {
                method: 'POST',
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders()
            });
        } catch (e) {
            console.error('Logout error:', e);
        }
        localStorage.removeItem('chess_auth_token');
        this.currentUser = null;
        this.updateUserUI();
        if (typeof showMessage === 'function') {
            showMessage('Вы вышли из учетной записи.');
        }
    }

    async handleCloudSave() {
        if (!this.currentUser) {
            this.openModal('login');
            return;
        }

        if (typeof gameState === 'undefined') {
            if (typeof showMessage === 'function') showMessage('Ошибка: состояние партии недоступно.');
            return;
        }

        try {
            if (this.btnCloudSave) {
                this.btnCloudSave.disabled = true;
                this.btnCloudSave.textContent = '⏳ Сохраняем...';
            }

            const res = await fetch(`${API_BASE}/api/user/save-game`, {
                method: 'POST',
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ gameState })
            });

            const data = await res.json();
            if (res.ok) {
                if (typeof showMessage === 'function') {
                    showMessage('✓ Партия сохранена в вашем аккаунте в базе данных!');
                }
            } else {
                if (typeof showMessage === 'function') {
                    showMessage('Ошибка сохранения: ' + (data.error || 'Неизвестная ошибка'));
                }
            }
        } catch (err) {
            console.error('Save to cloud error:', err);
            if (typeof showMessage === 'function') {
                showMessage('Ошибка связи с сервером базы данных.');
            }
        } finally {
            if (this.btnCloudSave) {
                this.btnCloudSave.disabled = false;
                this.btnCloudSave.textContent = '💾 Сохранить';
            }
        }
    }

    async openProfileModal() {
        if (!this.currentUser) {
            this.openModal('login');
            return;
        }

        if (this.profileOverlay) {
            this.profileOverlay.classList.remove('hidden');
            await this.loadProfileData();
        }
    }

    closeProfileModal() {
        if (this.profileOverlay) {
            this.profileOverlay.classList.add('hidden');
        }
    }

    async loadProfileData() {
        if (!this.currentUser) return;

        if (this.profileUsername) {
            this.profileUsername.textContent = this.currentUser.username;
        }
        if (this.profileCreatedDate && this.currentUser.createdAt) {
            const dateStr = new Date(this.currentUser.createdAt).toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            this.profileCreatedDate.textContent = `В игре с: ${dateStr}`;
        }

        try {
            const res = await fetch(`${API_BASE}/api/user/games`, {
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders()
            });

            if (res.ok) {
                const data = await res.json();
                const stats = data.stats || { wins: 0, losses: 0, draws: 0, total: 0 };
                const games = data.games || [];

                // Update stats cards
                if (this.statWinsNum) this.statWinsNum.textContent = stats.wins;
                if (this.statLossesNum) this.statLossesNum.textContent = stats.losses;
                if (this.statDrawsNum) this.statDrawsNum.textContent = stats.draws;

                const total = (stats.wins + stats.losses + stats.draws);
                const winrate = total > 0 ? Math.round((stats.wins / total) * 100) : 0;
                if (this.statWinrateNum) this.statWinrateNum.textContent = `${winrate}%`;

                // Update personal record highlight
                const profileRecordRow = document.getElementById('profile-record-row');
                const profileFastestVal = document.getElementById('profile-fastest-mate-val');
                let fastestMate = data.records && data.records.fastestMate ? data.records.fastestMate : null;
                if (!fastestMate && Array.isArray(games)) {
                    for (const g of games) {
                        if (g && g.result === 'win' && g.reason === 'checkmate' && g.movesCount > 0) {
                            if (!fastestMate || g.movesCount < fastestMate.movesCount) {
                                fastestMate = { movesCount: g.movesCount, fullMoves: Math.ceil(g.movesCount / 2) };
                            }
                        }
                    }
                }

                if (profileRecordRow && profileFastestVal) {
                    if (fastestMate) {
                        profileRecordRow.classList.remove('hidden');
                        const full = fastestMate.fullMoves || Math.ceil(fastestMate.movesCount / 2);
                        const plies = fastestMate.movesCount;
                        const mod10 = full % 10;
                        const mod100 = full % 100;
                        let movesWord = 'ходов';
                        if (mod100 < 11 || mod100 > 19) {
                            if (mod10 === 1) movesWord = 'ход';
                            else if (mod10 >= 2 && mod10 <= 4) movesWord = 'хода';
                        }
                        profileFastestVal.textContent = `${full} ${movesWord} (${plies} полуходов)`;
                    } else {
                        profileRecordRow.classList.add('hidden');
                    }
                }

                // Update current user cache
                this.currentUser.stats = stats;
                this.updateUserUI();

                // Render games list
                if (this.profileGamesCount) {
                    this.profileGamesCount.textContent = `${games.length} партий`;
                }

                if (this.profileGamesList) {
                    this.profileGamesList.innerHTML = '';
                    if (games.length === 0) {
                        this.profileGamesList.innerHTML = `
                            <div class="profile-empty-games">
                                ♟️ У вас пока нет сохраненных партий.<br>
                                Сыграйте онлайн по коду комнаты или проведите локальную партию!
                            </div>
                        `;
                    } else {
                        games.forEach(g => {
                            const card = document.createElement('div');
                            card.className = 'game-item-card';

                            let pillClass = 'result-draw';
                            let pillText = 'Ничья';
                            if (g.result === 'win') {
                                pillClass = 'result-win';
                                pillText = 'Победа';
                            } else if (g.result === 'loss') {
                                pillClass = 'result-loss';
                                pillText = 'Поражение';
                            }

                            const opponentLabel = g.opponent ? `vs ${g.opponent}` : 'Локальная партия';
                            const colorLabel = g.color === 'white' ? '⚪ Белые' : (g.color === 'black' ? '⚫ Черные' : '—');
                            const reasonMap = {
                                'checkmate': 'Мат',
                                'stalemate': 'Пат',
                                'resignation': 'Сдача'
                            };
                            const reasonLabel = reasonMap[g.reason] || g.reason || 'Завершено';
                            const movesLabel = g.movesCount ? `${Math.ceil(g.movesCount / 2)} ходов` : '';
                            const dateStr = g.date ? new Date(g.date).toLocaleDateString('ru-RU') + ' ' + new Date(g.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';

                            card.innerHTML = `
                                <div class="game-item-left">
                                    <span class="game-result-pill ${pillClass}">${pillText}</span>
                                    <div class="game-item-meta">
                                        <span class="game-opponent">${opponentLabel}</span>
                                        <span class="game-details-sub">${colorLabel} • ${reasonLabel} • ${movesLabel}</span>
                                    </div>
                                </div>
                                <div class="game-item-right">
                                    <span class="game-date">${dateStr}</span>
                                    ${g.roomCode ? `<span class="game-room-tag">#${g.roomCode}</span>` : ''}
                                </div>
                            `;
                            this.profileGamesList.appendChild(card);
                        });
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load profile data:', err);
        }
    }

    async recordGameOutcome(outcome, reason = 'checkmate', movesCount = 0) {
        if (!this.currentUser) return;
        try {
            const res = await fetch(`${API_BASE}/api/user/record-game`, {
                method: 'POST',
                credentials: isFileProtocol ? 'omit' : 'include',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ outcome, reason, movesCount })
            });
            if (res.ok) {
                const data = await res.json();
                this.currentUser.stats = data.stats;
                this.updateUserUI();
            }
        } catch (err) {
            console.error('Record result error:', err);
        }
    }
}

// Global instance initialized on DOM ready
let authController = null;
document.addEventListener('DOMContentLoaded', () => {
    authController = new AuthController();
    window.authController = authController;
});
