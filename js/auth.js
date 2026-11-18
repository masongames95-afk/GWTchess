/**
 * Authentication & Database Sync Controller
 * Manages user registration, login, live account existence checking,
 * session cookies / tokens, cloud game saves and stats in the JSON database.
 */

const API_BASE = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000'))
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
        this.btnCloudSave = document.getElementById('btn-cloud-save');
        this.btnLogout = document.getElementById('btn-logout');

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
                credentials: 'include',
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
                credentials: 'include',
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
                credentials: 'include',
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
                credentials: 'include',
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
                credentials: 'include',
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

    async recordGameOutcome(outcome) {
        if (!this.currentUser) return;
        try {
            const res = await fetch(`${API_BASE}/api/user/record-result`, {
                method: 'POST',
                credentials: 'include',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ outcome })
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
