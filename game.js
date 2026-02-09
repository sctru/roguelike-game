// Game State
const GameState = {
    DISCONNECTED: 'disconnected',
    CONNECTED: 'connected',
    IN_LOBBY: 'in_lobby',
    IN_ROOM: 'in_room',
    PLAYING: 'playing',
    UPGRADING: 'upgrading',
    GAME_OVER: 'game_over'
};

// Main Game Controller
class GameClient {
    constructor() {
        this.ws = null;
        this.state = GameState.DISCONNECTED;
        this.playerId = null;
        this.playerName = '';
        this.roomCode = null;
        this.isReady = false;
        this.players = [];
        this.gameData = null;

        // Canvas and rendering
        this.canvas = null;
        this.ctx = null;
        this.animationFrame = null;

        // Input state
        this.keys = {};
        this.mousePos = { x: 0, y: 0 };

        // Bind methods
        this.update = this.update.bind(this);
        this.render = this.render.bind(this);
        this.gameLoop = this.gameLoop.bind(this);

        this.init();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.setupCanvas();
        this.loadSavedSettings();
    }

    cacheElements() {
        // Screens
        this.screens = {
            connection: document.getElementById('connection-screen'),
            lobby: document.getElementById('lobby-screen'),
            game: document.getElementById('game-screen'),
            upgrade: document.getElementById('upgrade-screen'),
            gameover: document.getElementById('gameover-screen')
        };

        // Connection screen elements
        this.serverAddressInput = document.getElementById('server-address');
        this.connectBtn = document.getElementById('connect-btn');
        this.connectionStatus = document.getElementById('connection-status');

        // Lobby screen elements
        this.playerNameInput = document.getElementById('player-name');
        this.roomCodeInput = document.getElementById('room-code');
        this.joinRoomBtn = document.getElementById('join-room-btn');
        this.createRoomBtn = document.getElementById('create-room-btn');
        this.roomInfo = document.getElementById('room-info');
        this.currentRoomCode = document.getElementById('current-room-code');
        this.playersContainer = document.getElementById('players-container');
        this.readyBtn = document.getElementById('ready-btn');
        this.readyStatus = document.getElementById('ready-status');
        this.disconnectBtn = document.getElementById('disconnect-btn');

        // Game screen elements
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.teamHealthBars = document.getElementById('team-health-bars');
        this.currentRoomNum = document.getElementById('current-room-num');
        this.roomType = document.getElementById('room-type');
        this.playerHp = document.getElementById('player-hp');
        this.playerMaxHp = document.getElementById('player-max-hp');
        this.playerAtk = document.getElementById('player-atk');
        this.playerSpd = document.getElementById('player-spd');

        // Upgrade screen elements
        this.upgradeOptions = document.getElementById('upgrade-options');
        this.teamChoices = document.getElementById('team-choices');
        this.teamChoicesContainer = document.getElementById('team-choices-container');
        this.upgradeTimer = document.getElementById('upgrade-timer');

        // Game over screen elements
        this.gameoverTitle = document.getElementById('gameover-title');
        this.roomsCleared = document.getElementById('rooms-cleared');
        this.enemiesDefeated = document.getElementById('enemies-defeated');
        this.timeSurvived = document.getElementById('time-survived');
        this.returnLobbyBtn = document.getElementById('return-lobby-btn');
    }

    bindEvents() {
        // Connection events
        this.connectBtn.addEventListener('click', () => this.connect());
        this.serverAddressInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.connect();
        });

        // Lobby events
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.readyBtn.addEventListener('click', () => this.toggleReady());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());

        this.playerNameInput.addEventListener('input', () => {
            this.playerName = this.playerNameInput.value.trim();
            localStorage.setItem('playerName', this.playerName);
        });

        // Game over events
        this.returnLobbyBtn.addEventListener('click', () => this.returnToLobby());

        // Keyboard input
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Mouse input
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.onMouseClick(e));

        // Touch/mobile input
        this.setupMobileControls();

        // Controls panel toggle
        this.setupControlsPanel();

        // Window resize
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    setupCanvas() {
        this.resizeCanvas();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    loadSavedSettings() {
        const savedName = localStorage.getItem('playerName');
        if (savedName) {
            this.playerName = savedName;
            this.playerNameInput.value = savedName;
        }

        const savedServer = localStorage.getItem('serverAddress');
        if (savedServer) {
            this.serverAddressInput.value = savedServer;
        }
    }

    // WebSocket Connection
    connect() {
        const address = this.serverAddressInput.value.trim();
        if (!address) {
            this.showStatus('Please enter a server address', 'error');
            return;
        }

        localStorage.setItem('serverAddress', address);

        this.showStatus('Connecting...', 'connecting');
        this.connectBtn.disabled = true;

        try {
            this.ws = new WebSocket(address);

            this.ws.onopen = () => this.onWebSocketOpen();
            this.ws.onmessage = (event) => this.onWebSocketMessage(event);
            this.ws.onclose = (event) => this.onWebSocketClose(event);
            this.ws.onerror = (error) => this.onWebSocketError(error);
        } catch (error) {
            this.showStatus('Invalid server address', 'error');
            this.connectBtn.disabled = false;
        }
    }

    onWebSocketOpen() {
        this.state = GameState.CONNECTED;
        this.showStatus('Connected!', 'success');

        // Send initial handshake
        this.send({
            type: 'handshake',
            version: '1.0.0'
        });

        setTimeout(() => {
            this.showScreen('lobby');
            this.state = GameState.IN_LOBBY;
        }, 500);
    }

    onWebSocketMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        } catch (error) {
            console.error('Failed to parse message:', error);
        }
    }

    onWebSocketClose(event) {
        this.state = GameState.DISCONNECTED;
        this.ws = null;
        this.showStatus('Disconnected from server', 'error');
        this.connectBtn.disabled = false;
        this.showScreen('connection');
        this.stopGameLoop();
    }

    onWebSocketError(error) {
        console.error('WebSocket error:', error);
        this.showStatus('Connection error', 'error');
        this.connectBtn.disabled = false;
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    // Message Handling
    handleMessage(msg) {
        switch (msg.type) {
            case 'connected':
                this.playerId = msg.playerId;
                break;

            case 'room_created':
                this.onRoomJoined(msg.roomCode, msg.players);
                break;

            case 'room_joined':
                this.onRoomJoined(msg.roomCode, msg.players);
                break;

            case 'room_error':
                this.showRoomError(msg.message);
                break;

            case 'player_joined':
                this.onPlayerJoined(msg.player);
                break;

            case 'player_left':
                this.onPlayerLeft(msg.playerId);
                break;

            case 'player_ready':
                this.onPlayerReady(msg.playerId, msg.ready);
                break;

            case 'game_starting':
                this.onGameStarting(msg.countdown);
                break;

            case 'game_start':
                this.onGameStart(msg.gameData);
                break;

            case 'game_state':
                this.onGameState(msg.state);
                break;

            case 'room_cleared':
                this.onRoomCleared(msg.upgrades);
                break;

            case 'upgrade_chosen':
                this.onUpgradeChosen(msg.playerId, msg.upgradeName);
                break;

            case 'next_room':
                this.onNextRoom(msg.roomData);
                break;

            case 'game_over':
                this.onGameOver(msg.stats, msg.victory);
                break;

            default:
                console.log('Unknown message type:', msg.type);
        }
    }

    // Room Management
    createRoom() {
        if (!this.playerName) {
            alert('Please enter your name first');
            this.playerNameInput.focus();
            return;
        }

        this.send({
            type: 'create_room',
            playerName: this.playerName
        });
    }

    joinRoom() {
        if (!this.playerName) {
            alert('Please enter your name first');
            this.playerNameInput.focus();
            return;
        }

        const code = this.roomCodeInput.value.trim().toUpperCase();
        if (!code) {
            alert('Please enter a room code');
            this.roomCodeInput.focus();
            return;
        }

        this.send({
            type: 'join_room',
            roomCode: code,
            playerName: this.playerName
        });
    }

    onRoomJoined(roomCode, players) {
        this.roomCode = roomCode;
        this.players = players;
        this.state = GameState.IN_ROOM;

        this.currentRoomCode.textContent = roomCode;
        this.roomInfo.classList.remove('hidden');
        this.updatePlayersList();
    }

    showRoomError(message) {
        alert(message);
    }

    onPlayerJoined(player) {
        this.players.push(player);
        this.updatePlayersList();
    }

    onPlayerLeft(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        this.updatePlayersList();
    }

    updatePlayersList() {
        this.playersContainer.innerHTML = '';

        for (let i = 0; i < 4; i++) {
            const player = this.players[i];
            const slot = document.createElement('div');
            slot.className = 'player-slot';

            if (player) {
                if (player.id === this.playerId) {
                    slot.classList.add('you');
                }
                if (player.ready) {
                    slot.classList.add('ready');
                }

                slot.innerHTML = `
                    <div class="player-avatar">${player.name.charAt(0).toUpperCase()}</div>
                    <span class="player-name">${player.name}${player.id === this.playerId ? ' (You)' : ''}</span>
                    ${player.ready ? '<span class="player-ready-icon">&#10003;</span>' : ''}
                `;
            } else {
                slot.classList.add('empty');
                slot.innerHTML = `
                    <div class="player-avatar">?</div>
                    <span class="player-name">Waiting...</span>
                `;
            }

            this.playersContainer.appendChild(slot);
        }

        this.updateReadyStatus();
    }

    toggleReady() {
        this.isReady = !this.isReady;
        this.readyBtn.classList.toggle('active', this.isReady);
        this.readyBtn.textContent = this.isReady ? 'Ready!' : 'Ready Up';

        this.send({
            type: 'set_ready',
            ready: this.isReady
        });
    }

    onPlayerReady(playerId, ready) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.ready = ready;
            this.updatePlayersList();
        }
    }

    updateReadyStatus() {
        const readyCount = this.players.filter(p => p.ready).length;
        const totalPlayers = this.players.length;

        if (totalPlayers < 1) {
            this.readyStatus.textContent = 'Waiting for players...';
        } else if (readyCount === totalPlayers) {
            this.readyStatus.textContent = 'All players ready! Starting soon...';
        } else {
            this.readyStatus.textContent = `${readyCount}/${totalPlayers} players ready`;
        }
    }

    onGameStarting(countdown) {
        this.readyStatus.textContent = `Game starting in ${countdown}...`;
    }

    // Game Logic
    onGameStart(gameData) {
        this.gameData = gameData;
        this.state = GameState.PLAYING;
        this.showScreen('game');
        this.initGameState(gameData);
        this.startGameLoop();
    }

    initGameState(data) {
        // Initialize local game state from server data
        this.localPlayers = data.players || [];
        this.enemies = data.enemies || [];
        this.projectiles = data.projectiles || [];
        this.roomNumber = data.roomNumber || 1;
        this.roomType = data.roomType || 'Combat';

        this.updateHUD();
        this.updateTeamHealthBars();
    }

    onGameState(state) {
        // Update game state from server
        if (state.players) this.localPlayers = state.players;
        if (state.enemies) this.enemies = state.enemies;
        if (state.projectiles) this.projectiles = state.projectiles;

        this.updateHUD();
        this.updateTeamHealthBars();
    }

    updateHUD() {
        const myPlayer = this.localPlayers?.find(p => p.id === this.playerId);
        if (myPlayer) {
            this.playerHp.textContent = Math.floor(myPlayer.hp);
            this.playerMaxHp.textContent = Math.floor(myPlayer.maxHp);
            this.playerAtk.textContent = myPlayer.attack || 10;
            this.playerSpd.textContent = (myPlayer.speed || 1).toFixed(1);
        }

        this.currentRoomNum.textContent = `Room ${this.roomNumber}`;
        document.getElementById('room-type').textContent = this.roomType;
    }

    updateTeamHealthBars() {
        this.teamHealthBars.innerHTML = '';

        this.localPlayers?.forEach((player, index) => {
            const bar = document.createElement('div');
            bar.className = 'team-health-bar';
            const healthPercent = (player.hp / player.maxHp) * 100;

            bar.innerHTML = `
                <div class="name">${player.name}</div>
                <div class="health-bar-container">
                    <div class="health-bar-fill" style="width: ${healthPercent}%"></div>
                </div>
            `;

            this.teamHealthBars.appendChild(bar);
        });
    }

    // Game Loop
    startGameLoop() {
        this.lastTime = performance.now();
        this.gameLoop();
    }

    stopGameLoop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    gameLoop(currentTime = performance.now()) {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        if (this.state === GameState.PLAYING) {
            this.animationFrame = requestAnimationFrame(this.gameLoop);
        }
    }

    update(dt) {
        // Send input to server
        this.sendInput();

        // Client-side prediction could go here
    }

    sendInput() {
        const input = {
            type: 'input',
            keys: {
                up: this.keys['KeyW'] || this.keys['ArrowUp'],
                down: this.keys['KeyS'] || this.keys['ArrowDown'],
                left: this.keys['KeyA'] || this.keys['ArrowLeft'],
                right: this.keys['KeyD'] || this.keys['ArrowRight'],
                attack: this.keys['Space'] || this.keys['mouse0'],
                dash: this.keys['ShiftLeft'] || this.keys['ShiftRight']
            },
            mouseX: this.mousePos.x,
            mouseY: this.mousePos.y
        };

        this.send(input);
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear canvas
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, width, height);

        // Draw game arena
        this.drawArena(ctx, width, height);

        // Draw enemies
        this.drawEnemies(ctx);

        // Draw projectiles
        this.drawProjectiles(ctx);

        // Draw players
        this.drawPlayers(ctx);
    }

    drawArena(ctx, width, height) {
        const padding = 50;
        const arenaWidth = width - padding * 2;
        const arenaHeight = height - padding * 2;

        ctx.strokeStyle = '#2a2a3a';
        ctx.lineWidth = 2;
        ctx.strokeRect(padding, padding, arenaWidth, arenaHeight);

        // Draw floor pattern
        ctx.fillStyle = '#12121a';
        ctx.fillRect(padding, padding, arenaWidth, arenaHeight);

        // Grid pattern
        ctx.strokeStyle = '#1a1a2a';
        ctx.lineWidth = 1;
        const gridSize = 50;

        for (let x = padding; x <= width - padding; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, padding);
            ctx.lineTo(x, height - padding);
            ctx.stroke();
        }

        for (let y = padding; y <= height - padding; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
    }

    drawPlayers(ctx) {
        const playerColors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a855f7'];

        this.localPlayers?.forEach((player, index) => {
            const x = player.x || 400;
            const y = player.y || 300;
            const radius = 20;

            // Player shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.ellipse(x, y + radius, radius * 0.8, radius * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();

            // Player body
            ctx.fillStyle = playerColors[index % 4];
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            // Player direction indicator
            if (player.angle !== undefined) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(
                    x + Math.cos(player.angle) * radius * 1.5,
                    y + Math.sin(player.angle) * radius * 1.5
                );
                ctx.stroke();
            }

            // Player name
            ctx.fillStyle = '#fff';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(player.name, x, y - radius - 8);

            // Health bar above player
            const healthWidth = 40;
            const healthHeight = 4;
            const healthPercent = player.hp / player.maxHp;

            ctx.fillStyle = '#333';
            ctx.fillRect(x - healthWidth/2, y - radius - 20, healthWidth, healthHeight);

            ctx.fillStyle = healthPercent > 0.5 ? '#10b981' : healthPercent > 0.25 ? '#f59e0b' : '#ef4444';
            ctx.fillRect(x - healthWidth/2, y - radius - 20, healthWidth * healthPercent, healthHeight);
        });
    }

    drawEnemies(ctx) {
        this.enemies?.forEach(enemy => {
            const x = enemy.x || 200;
            const y = enemy.y || 200;
            const radius = enemy.radius || 25;

            // Enemy shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.ellipse(x, y + radius, radius * 0.8, radius * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();

            // Enemy body
            ctx.fillStyle = enemy.color || '#ef4444';
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            // Enemy type indicator
            ctx.fillStyle = '#000';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(enemy.type?.charAt(0) || 'E', x, y);

            // Health bar
            if (enemy.hp !== undefined && enemy.maxHp !== undefined) {
                const healthWidth = radius * 2;
                const healthHeight = 4;
                const healthPercent = enemy.hp / enemy.maxHp;

                ctx.fillStyle = '#333';
                ctx.fillRect(x - healthWidth/2, y - radius - 10, healthWidth, healthHeight);

                ctx.fillStyle = '#ef4444';
                ctx.fillRect(x - healthWidth/2, y - radius - 10, healthWidth * healthPercent, healthHeight);
            }
        });
    }

    drawProjectiles(ctx) {
        this.projectiles?.forEach(proj => {
            ctx.fillStyle = proj.color || '#ffff00';
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, proj.radius || 5, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // Input Handling
    onKeyDown(e) {
        this.keys[e.code] = true;
    }

    onKeyUp(e) {
        this.keys[e.code] = false;
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mousePos.x = e.clientX - rect.left;
        this.mousePos.y = e.clientY - rect.top;
    }

    onMouseClick(e) {
        this.keys['mouse0'] = true;
        setTimeout(() => {
            this.keys['mouse0'] = false;
        }, 100);
    }

    setupMobileControls() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile) {
            document.getElementById('mobile-controls').classList.remove('hidden');

            // D-pad controls
            document.querySelectorAll('.dpad-btn').forEach(btn => {
                const dir = btn.dataset.dir;
                const keyMap = {
                    up: 'KeyW',
                    down: 'KeyS',
                    left: 'KeyA',
                    right: 'KeyD'
                };

                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.keys[keyMap[dir]] = true;
                });

                btn.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    this.keys[keyMap[dir]] = false;
                });
            });

            // Action buttons
            document.getElementById('attack-btn').addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.keys['Space'] = true;
            });

            document.getElementById('attack-btn').addEventListener('touchend', (e) => {
                e.preventDefault();
                this.keys['Space'] = false;
            });

            document.getElementById('dash-btn').addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.keys['ShiftLeft'] = true;
            });

            document.getElementById('dash-btn').addEventListener('touchend', (e) => {
                e.preventDefault();
                this.keys['ShiftLeft'] = false;
            });
        }
    }

    setupControlsPanel() {
        const toggle = document.getElementById('controls-toggle');
        const content = document.getElementById('controls-content');

        if (toggle && content) {
            toggle.addEventListener('click', () => {
                content.classList.toggle('visible');
            });

            // Close when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#controls-panel')) {
                    content.classList.remove('visible');
                }
            });
        }
    }

    // Upgrade System
    onRoomCleared(upgrades) {
        this.state = GameState.UPGRADING;
        this.stopGameLoop();
        this.showScreen('upgrade');
        this.displayUpgrades(upgrades);
    }

    displayUpgrades(upgrades) {
        this.upgradeOptions.innerHTML = '';

        const upgradeIcons = {
            'health': '&#10084;',
            'attack': '&#9876;',
            'speed': '&#9889;',
            'defense': '&#128737;',
            'crit': '&#10070;',
            'lifesteal': '&#129656;',
            'multishot': '&#10024;',
            'dash': '&#8644;'
        };

        upgrades.forEach((upgrade, index) => {
            const card = document.createElement('div');
            card.className = `upgrade-card rarity-${upgrade.rarity || 'common'}`;

            card.innerHTML = `
                <div class="upgrade-icon">${upgradeIcons[upgrade.icon] || '&#9733;'}</div>
                <div class="upgrade-name">${upgrade.name}</div>
                <div class="upgrade-rarity">${upgrade.rarity || 'Common'}</div>
                <div class="upgrade-description">${upgrade.description}</div>
            `;

            card.addEventListener('click', () => this.selectUpgrade(index, card));
            this.upgradeOptions.appendChild(card);
        });

        this.teamChoices.classList.add('hidden');
        this.upgradeTimer.textContent = 'Choose your upgrade...';
    }

    selectUpgrade(index, cardElement) {
        // Remove previous selection
        document.querySelectorAll('.upgrade-card').forEach(c => c.classList.remove('selected'));

        // Mark this one as selected
        cardElement.classList.add('selected');

        // Send choice to server
        this.send({
            type: 'select_upgrade',
            upgradeIndex: index
        });

        this.upgradeTimer.textContent = 'Waiting for other players...';
    }

    onUpgradeChosen(playerId, upgradeName) {
        this.teamChoices.classList.remove('hidden');

        // Update or add player choice display
        let existingChoice = this.teamChoicesContainer.querySelector(`[data-player="${playerId}"]`);
        const player = this.players.find(p => p.id === playerId);

        if (!existingChoice) {
            existingChoice = document.createElement('div');
            existingChoice.className = 'team-choice';
            existingChoice.dataset.player = playerId;
            this.teamChoicesContainer.appendChild(existingChoice);
        }

        existingChoice.classList.remove('pending');
        existingChoice.innerHTML = `
            <div class="player-dot"></div>
            <span class="choice-text">${player?.name || 'Player'}: ${upgradeName}</span>
        `;
    }

    onNextRoom(roomData) {
        this.roomNumber = roomData.roomNumber;
        this.roomType = roomData.roomType;
        this.enemies = roomData.enemies || [];

        this.teamChoicesContainer.innerHTML = '';
        this.state = GameState.PLAYING;
        this.showScreen('game');
        this.startGameLoop();
    }

    // Game Over
    onGameOver(stats, victory) {
        this.state = GameState.GAME_OVER;
        this.stopGameLoop();
        this.showScreen('gameover');

        this.gameoverTitle.textContent = victory ? 'Victory!' : 'Game Over';
        this.gameoverTitle.style.color = victory ? '#10b981' : '#ef4444';

        this.roomsCleared.textContent = stats.roomsCleared || 0;
        this.enemiesDefeated.textContent = stats.enemiesDefeated || 0;

        const minutes = Math.floor(stats.timeSurvived / 60);
        const seconds = stats.timeSurvived % 60;
        this.timeSurvived.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    returnToLobby() {
        this.state = GameState.IN_ROOM;
        this.isReady = false;
        this.readyBtn.classList.remove('active');
        this.readyBtn.textContent = 'Ready Up';
        this.showScreen('lobby');

        // Request updated player list
        this.send({ type: 'get_room_state' });
    }

    // Screen Management
    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => {
            screen.classList.remove('active');
        });

        if (this.screens[screenName]) {
            this.screens[screenName].classList.add('active');
        }
    }

    showStatus(message, type = '') {
        this.connectionStatus.textContent = message;
        this.connectionStatus.className = 'status ' + type;
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.game = new GameClient();
});
