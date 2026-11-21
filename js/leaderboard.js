/**
 * Leaderboard & Hall of Fame Controller
 * Manages fetching, tab switching, and rendering top accounts by:
 * - Fastest checkmate (fewest moves)
 * - Most total wins
 * - Best winrate percentage
 * - Most active players (total games played)
 */

class LeaderboardController {
    constructor() {
        this.activeTab = 'fastest-mate'; // 'fastest-mate' | 'wins' | 'winrate' | 'active'
        this.data = null;
        this.isLoading = false;

        // Elements
        this.overlay = document.getElementById('leaderboard-overlay');
        this.btnOpenHeader = document.getElementById('btn-open-leaderboard');
        this.btnOpenSidebar = document.getElementById('btn-sidebar-leaderboard');
        this.btnClose = document.getElementById('btn-close-leaderboard');
        this.btnRefresh = document.getElementById('btn-refresh-leaderboard');

        // Tabs
        this.tabFastestMate = document.getElementById('tab-lb-fastest-mate');
        this.tabWins = document.getElementById('tab-lb-wins');
        this.tabWinrate = document.getElementById('tab-lb-winrate');
        this.tabActive = document.getElementById('tab-lb-active');

        // Table & containers
        this.userSummary = document.getElementById('lb-user-summary');
        this.thead = document.getElementById('lb-thead');
        this.tbody = document.getElementById('lb-tbody');
        this.emptyMsg = document.getElementById('lb-empty-msg');

        this.init();
    }

    init() {
        // Open buttons
        if (this.btnOpenHeader) {
            this.btnOpenHeader.addEventListener('click', () => this.openModal());
        }
        if (this.btnOpenSidebar) {
            this.btnOpenSidebar.addEventListener('click', () => this.openModal());
        }

        // Close button & overlay click
        if (this.btnClose) {
            this.btnClose.addEventListener('click', () => this.closeModal());
        }
        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) this.closeModal();
            });
        }

        // Refresh button
        if (this.btnRefresh) {
            this.btnRefresh.addEventListener('click', () => this.fetchLeaderboard(true));
        }

        // Tab click handlers
        if (this.tabFastestMate) {
            this.tabFastestMate.addEventListener('click', () => this.switchTab('fastest-mate'));
        }
        if (this.tabWins) {
            this.tabWins.addEventListener('click', () => this.switchTab('wins'));
        }
        if (this.tabWinrate) {
            this.tabWinrate.addEventListener('click', () => this.switchTab('winrate'));
        }
        if (this.tabActive) {
            this.tabActive.addEventListener('click', () => this.switchTab('active'));
        }

        // Keyboard navigation (Esc to close)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay && !this.overlay.classList.contains('hidden')) {
                this.closeModal();
            }
        });
    }

    async openModal() {
        if (!this.overlay) return;
        this.overlay.classList.remove('hidden');
        await this.fetchLeaderboard();
    }

    closeModal() {
        if (this.overlay) {
            this.overlay.classList.add('hidden');
        }
    }

    switchTab(tabKey) {
        this.activeTab = tabKey;

        const tabs = [
            { key: 'fastest-mate', el: this.tabFastestMate },
            { key: 'wins', el: this.tabWins },
            { key: 'winrate', el: this.tabWinrate },
            { key: 'active', el: this.tabActive }
        ];

        tabs.forEach(t => {
            if (t.el) {
                if (t.key === tabKey) {
                    t.el.classList.add('active');
                } else {
                    t.el.classList.remove('active');
                }
            }
        });

        this.render();
    }

    async fetchLeaderboard(force = false) {
        if (this.isLoading) return;
        this.isLoading = true;

        if (this.btnRefresh) {
            this.btnRefresh.classList.add('spinning');
        }

        const isFile = window.location.protocol === 'file:';
        const base = (isFile || (window.location.port && window.location.port !== '3000'))
            ? 'http://localhost:3000'
            : '';

        try {
            const headers = {};
            const token = localStorage.getItem('chess_auth_token');
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(`${base}/api/leaderboard?limit=25${force ? '&_t=' + Date.now() : ''}`, {
                credentials: isFile ? 'omit' : 'include',
                headers
            });

            if (res.ok) {
                this.data = await res.json();
                this.render();
            } else {
                console.error('Failed to load leaderboard data:', res.statusText);
            }
        } catch (err) {
            console.error('Leaderboard fetch network error:', err);
        } finally {
            this.isLoading = false;
            if (this.btnRefresh) {
                this.btnRefresh.classList.remove('spinning');
            }
        }
    }

    render() {
        if (!this.data || !this.data.leaderboards) {
            if (this.emptyMsg) {
                this.emptyMsg.textContent = 'Загрузка данных таблицы рекордов...';
                this.emptyMsg.classList.remove('hidden');
            }
            return;
        }

        const currentUsername = window.authController && window.authController.currentUser
            ? window.authController.currentUser.username
            : null;

        this.renderUserSummary(currentUsername);

        if (this.activeTab === 'fastest-mate') {
            this.renderFastestMate(this.data.leaderboards.fastestMates || [], currentUsername);
        } else if (this.activeTab === 'wins') {
            this.renderMostWins(this.data.leaderboards.mostWins || [], currentUsername);
        } else if (this.activeTab === 'winrate') {
            this.renderBestWinrate(this.data.leaderboards.bestWinrate || [], currentUsername);
        } else if (this.activeTab === 'active') {
            this.renderMostActive(this.data.leaderboards.mostActive || [], currentUsername);
        }
    }

    renderUserSummary(currentUsername) {
        if (!this.userSummary) return;

        if (!currentUsername) {
            this.userSummary.classList.remove('hidden');
            this.userSummary.innerHTML = `
                <div class="lb-summary-inner">
                    <span class="lb-summary-icon">💡</span>
                    <span class="lb-summary-text">
                        <strong>Играете как гость.</strong> 
                        <a href="javascript:void(0)" id="lb-guest-login-link" class="lb-link">Войдите в аккаунт</a>, 
                        чтобы ваши победы и рекордные маты фиксировались в зале славы!
                    </span>
                </div>
            `;
            const link = document.getElementById('lb-guest-login-link');
            if (link) {
                link.addEventListener('click', () => {
                    this.closeModal();
                    if (window.authController) {
                        window.authController.openModal('login');
                    }
                });
            }
            return;
        }

        const rankData = this.data.userRank;
        if (!rankData) {
            this.userSummary.classList.add('hidden');
            return;
        }

        this.userSummary.classList.remove('hidden');
        let statusHtml = '';

        if (this.activeTab === 'fastest-mate') {
            if (rankData.fastestMate && rankData.fastestMateRank) {
                const moveDesc = this.formatMovesPlural(rankData.fastestMate.movesCount, rankData.fastestMate.fullMoves);
                statusHtml = `
                    <div class="lb-summary-inner">
                        <span class="lb-summary-icon">⚡</span>
                        <div class="lb-summary-text">
                            <span>Вы: <strong>${rankData.username}</strong></span>
                            <span class="lb-summary-highlight">Ваш рекорд: <strong>${moveDesc.fullText}</strong> (${moveDesc.pliesText}) • Место в топе: <strong>#${rankData.fastestMateRank}</strong></span>
                        </div>
                    </div>
                `;
            } else {
                statusHtml = `
                    <div class="lb-summary-inner">
                        <span class="lb-summary-icon">🎯</span>
                        <div class="lb-summary-text">
                            <span>Вы: <strong>${rankData.username}</strong></span>
                            <span>У вас пока нет зафиксированных побед матом. Одержите победу матом, чтобы попасть в таблицу рекордов!</span>
                        </div>
                    </div>
                `;
            }
        } else if (this.activeTab === 'wins') {
            const winsCount = rankData.stats ? rankData.stats.wins : 0;
            const rankLabel = rankData.winsRank ? `#${rankData.winsRank}` : '—';
            statusHtml = `
                <div class="lb-summary-inner">
                    <span class="lb-summary-icon">🏆</span>
                    <div class="lb-summary-text">
                        <span>Вы: <strong>${rankData.username}</strong></span>
                        <span class="lb-summary-highlight">Побед: <strong>${winsCount}</strong> • Место в рейтинге побед: <strong>${rankLabel}</strong></span>
                    </div>
                </div>
            `;
        } else if (this.activeTab === 'winrate') {
            const stats = rankData.stats || { wins: 0, total: 0 };
            const wr = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;
            const rankLabel = rankData.winrateRank ? `#${rankData.winrateRank}` : '—';
            statusHtml = `
                <div class="lb-summary-inner">
                    <span class="lb-summary-icon">🎯</span>
                    <div class="lb-summary-text">
                        <span>Вы: <strong>${rankData.username}</strong></span>
                        <span class="lb-summary-highlight">Винрейт: <strong>${wr}%</strong> (${stats.wins} из ${stats.total}) • Место: <strong>${rankLabel}</strong></span>
                    </div>
                </div>
            `;
        } else if (this.activeTab === 'active') {
            const stats = rankData.stats || { total: 0 };
            const rankLabel = rankData.activeRank ? `#${rankData.activeRank}` : '—';
            statusHtml = `
                <div class="lb-summary-inner">
                    <span class="lb-summary-icon">⚔️</span>
                    <div class="lb-summary-text">
                        <span>Вы: <strong>${rankData.username}</strong></span>
                        <span class="lb-summary-highlight">Сыграно партий: <strong>${stats.total}</strong> • Место по активности: <strong>${rankLabel}</strong></span>
                    </div>
                </div>
            `;
        }

        this.userSummary.innerHTML = statusHtml;
    }

    renderFastestMate(list, currentUsername) {
        if (!this.thead || !this.tbody) return;

        this.thead.innerHTML = `
            <tr>
                <th class="col-rank">#</th>
                <th class="col-user">Игрок</th>
                <th class="col-metric">Рекорд (ходов)</th>
                <th class="col-extra">Соперник</th>
                <th class="col-date">Дата</th>
            </tr>
        `;

        this.tbody.innerHTML = '';

        if (!list || list.length === 0) {
            this.showEmpty('Пока никто не одержал победу матом. Поставьте первый мат!');
            return;
        }

        this.hideEmpty();

        list.forEach(entry => {
            const tr = document.createElement('tr');
            const isMe = currentUsername && entry.username.toLowerCase() === currentUsername.toLowerCase();
            if (isMe) tr.classList.add('current-user-row');

            const rankBadge = this.getRankBadgeHtml(entry.rank);
            const moves = this.formatMovesPlural(entry.movesCount, entry.fullMoves);
            const dateStr = this.formatDate(entry.date);
            const oppLabel = entry.opponent ? (entry.opponent.startsWith('Локальная') ? '♟️ Локально' : `vs ${entry.opponent}`) : 'Соперник';

            tr.innerHTML = `
                <td class="col-rank">${rankBadge}</td>
                <td class="col-user">
                    <div class="lb-user-cell">
                        <span class="lb-avatar-mini">👤</span>
                        <span class="lb-username">${this.escapeHtml(entry.username)}</span>
                        ${isMe ? '<span class="lb-you-tag">Вы</span>' : ''}
                    </div>
                </td>
                <td class="col-metric">
                    <div class="lb-metric-primary">
                        <span class="lb-highlight-metric">⚡ ${moves.fullText}</span>
                        <span class="lb-metric-sub">(${moves.pliesText})</span>
                    </div>
                </td>
                <td class="col-extra">
                    <span class="lb-opponent-label" title="${this.escapeHtml(oppLabel)}">${this.escapeHtml(oppLabel)}</span>
                </td>
                <td class="col-date">
                    <span class="lb-date-text">${dateStr}</span>
                </td>
            `;

            this.tbody.appendChild(tr);
        });
    }

    renderMostWins(list, currentUsername) {
        if (!this.thead || !this.tbody) return;

        this.thead.innerHTML = `
            <tr>
                <th class="col-rank">#</th>
                <th class="col-user">Игрок</th>
                <th class="col-metric">Побед</th>
                <th class="col-extra">В / П / Н</th>
                <th class="col-rate">Винрейт</th>
            </tr>
        `;

        this.tbody.innerHTML = '';

        if (!list || list.length === 0) {
            this.showEmpty('Пока нет зарегистрированных игроков с победами.');
            return;
        }

        this.hideEmpty();

        list.forEach(entry => {
            const tr = document.createElement('tr');
            const isMe = currentUsername && entry.username.toLowerCase() === currentUsername.toLowerCase();
            if (isMe) tr.classList.add('current-user-row');

            const rankBadge = this.getRankBadgeHtml(entry.rank);

            tr.innerHTML = `
                <td class="col-rank">${rankBadge}</td>
                <td class="col-user">
                    <div class="lb-user-cell">
                        <span class="lb-avatar-mini">👤</span>
                        <span class="lb-username">${this.escapeHtml(entry.username)}</span>
                        ${isMe ? '<span class="lb-you-tag">Вы</span>' : ''}
                    </div>
                </td>
                <td class="col-metric">
                    <span class="lb-highlight-metric wins-metric">🏆 ${entry.wins}</span>
                </td>
                <td class="col-extra">
                    <span class="lb-score-pill">${entry.wins} В • ${entry.losses} П • ${entry.draws} Н</span>
                </td>
                <td class="col-rate">
                    <span class="lb-winrate-tag">${entry.winrate}%</span>
                </td>
            `;

            this.tbody.appendChild(tr);
        });
    }

    renderBestWinrate(list, currentUsername) {
        if (!this.thead || !this.tbody) return;

        this.thead.innerHTML = `
            <tr>
                <th class="col-rank">#</th>
                <th class="col-user">Игрок</th>
                <th class="col-metric">Винрейт</th>
                <th class="col-extra">Партий сыграно</th>
                <th class="col-rate">Побед</th>
            </tr>
        `;

        this.tbody.innerHTML = '';

        if (!list || list.length === 0) {
            this.showEmpty('Пока нет сыгранных партий.');
            return;
        }

        this.hideEmpty();

        list.forEach(entry => {
            const tr = document.createElement('tr');
            const isMe = currentUsername && entry.username.toLowerCase() === currentUsername.toLowerCase();
            if (isMe) tr.classList.add('current-user-row');

            const rankBadge = this.getRankBadgeHtml(entry.rank);

            tr.innerHTML = `
                <td class="col-rank">${rankBadge}</td>
                <td class="col-user">
                    <div class="lb-user-cell">
                        <span class="lb-avatar-mini">👤</span>
                        <span class="lb-username">${this.escapeHtml(entry.username)}</span>
                        ${isMe ? '<span class="lb-you-tag">Вы</span>' : ''}
                    </div>
                </td>
                <td class="col-metric">
                    <span class="lb-highlight-metric winrate-metric">🎯 ${entry.winrate}%</span>
                </td>
                <td class="col-extra">
                    <span class="lb-score-pill">${entry.total} партий</span>
                </td>
                <td class="col-rate">
                    <span class="lb-stat-count">${entry.wins} побед</span>
                </td>
            `;

            this.tbody.appendChild(tr);
        });
    }

    renderMostActive(list, currentUsername) {
        if (!this.thead || !this.tbody) return;

        this.thead.innerHTML = `
            <tr>
                <th class="col-rank">#</th>
                <th class="col-user">Игрок</th>
                <th class="col-metric">Всего игр</th>
                <th class="col-extra">Побед / Ничьих</th>
                <th class="col-rate">Винрейт</th>
            </tr>
        `;

        this.tbody.innerHTML = '';

        if (!list || list.length === 0) {
            this.showEmpty('Пока нет активности.');
            return;
        }

        this.hideEmpty();

        list.forEach(entry => {
            const tr = document.createElement('tr');
            const isMe = currentUsername && entry.username.toLowerCase() === currentUsername.toLowerCase();
            if (isMe) tr.classList.add('current-user-row');

            const rankBadge = this.getRankBadgeHtml(entry.rank);

            tr.innerHTML = `
                <td class="col-rank">${rankBadge}</td>
                <td class="col-user">
                    <div class="lb-user-cell">
                        <span class="lb-avatar-mini">👤</span>
                        <span class="lb-username">${this.escapeHtml(entry.username)}</span>
                        ${isMe ? '<span class="lb-you-tag">Вы</span>' : ''}
                    </div>
                </td>
                <td class="col-metric">
                    <span class="lb-highlight-metric active-metric">⚔️ ${entry.total}</span>
                </td>
                <td class="col-extra">
                    <span class="lb-score-pill">${entry.wins} В • ${entry.draws} Н</span>
                </td>
                <td class="col-rate">
                    <span class="lb-winrate-tag">${entry.winrate}%</span>
                </td>
            `;

            this.tbody.appendChild(tr);
        });
    }

    getRankBadgeHtml(rank) {
        if (rank === 1) {
            return `<span class="rank-badge rank-1" title="1-е место">🥇 #1</span>`;
        } else if (rank === 2) {
            return `<span class="rank-badge rank-2" title="2-е место">🥈 #2</span>`;
        } else if (rank === 3) {
            return `<span class="rank-badge rank-3" title="3-е место">🥉 #3</span>`;
        }
        return `<span class="rank-badge rank-normal">#${rank}</span>`;
    }

    formatMovesPlural(movesCount, fullMoves) {
        const full = typeof fullMoves === 'number' ? fullMoves : Math.ceil(movesCount / 2);
        const plies = typeof movesCount === 'number' ? movesCount : 0;

        function pluralize(n, one, few, many) {
            const mod10 = n % 10;
            const mod100 = n % 100;
            if (mod100 >= 11 && mod100 <= 19) return `${n} ${many}`;
            if (mod10 === 1) return `${n} ${one}`;
            if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`;
            return `${n} ${many}`;
        }

        return {
            fullText: pluralize(full, 'ход', 'хода', 'ходов'),
            pliesText: pluralize(plies, 'полуход', 'полухода', 'полуходов')
        };
    }

    formatDate(dateVal) {
        if (!dateVal) return '—';
        try {
            const d = new Date(dateVal);
            return d.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        } catch (e) {
            return '—';
        }
    }

    showEmpty(message) {
        if (this.emptyMsg) {
            this.emptyMsg.textContent = message;
            this.emptyMsg.classList.remove('hidden');
        }
    }

    hideEmpty() {
        if (this.emptyMsg) {
            this.emptyMsg.classList.add('hidden');
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Global instance initialized on DOM ready
let leaderboardController = null;
document.addEventListener('DOMContentLoaded', () => {
    leaderboardController = new LeaderboardController();
    window.leaderboardController = leaderboardController;
});
