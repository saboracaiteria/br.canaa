// ============================================
// CÓDIGO MULTIPLAYER - SOCKET.IO
// Adicionar ANTES do código Three.js no multiplayer.html
// ============================================

let socket = null;
let isMultiplayer = false;
let myPlayerId = null;
let currentRoomCode = null;
let remotePlayers = new Map(); // playerId -> { model, nametag, state }
let lastPingTime = 0;
let currentPing = 0;

// ========== FUNÇÕES DE NAVEGAÇÃO ==========
window.showRoomOptions = function () {
    document.getElementById('mode-select-screen').classList.add('hidden');
    document.getElementById('create-room-screen').classList.remove('hidden');
};

window.showJoinRoom = function () {
    document.getElementById('mode-select-screen').classList.add('hidden');
    document.getElementById('join-room-screen').classList.remove('hidden');
};

window.backToModeSelect = function () {
    document.getElementById('create-room-screen').classList.add('hidden');
    document.getElementById('join-room-screen').classList.add('hidden');
    document.getElementById('mode-select-screen').classList.remove('hidden');
};

// ========== CRIAR SALA ==========
window.createRoom = function () {
    const playerName = document.getElementById('player-name-input').value.trim() || `Jogador${Math.floor(Math.random() * 1000)}`;
    const maxPlayers = parseInt(document.getElementById('max-players-input').value) || 50;

    // Conectar ao servidor
    socket = io();
    isMultiplayer = true;

    socket.emit('create-room', { playerName, maxPlayers });

    socket.on('room-created', (data) => {
        myPlayerId = data.playerId;
        currentRoomCode = data.roomCode;

        document.getElementById('lobby-code-display').innerText = currentRoomCode;
        document.getElementById('create-room-screen').classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('hidden');

        updatePlayersList([{ id: data.playerId, name: playerName }]);
        setupMultiplayerListeners();
    });

    socket.on('error', (data) => {
        alert(data.message);
    });
};

// ========== ENTRAR EM SALA ==========
window.joinRoom = function () {
    const playerName = document.getElementById('player-name-input').value.trim() || `Jogador${Math.floor(Math.random() * 1000)}`;
    const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();

    if (!roomCode || roomCode.length !== 6) {
        alert('Digite um código de sala válido (6 caracteres)');
        return;
    }

    // Conectar ao servidor
    socket = io();
    isMultiplayer = true;

    socket.emit('join-room', { roomCode, playerName });

    socket.on('room-joined', (data) => {
        myPlayerId = data.playerId;
        currentRoomCode = data.roomCode;

        document.getElementById('lobby-code-display').innerText = currentRoomCode;
        document.getElementById('join-room-screen').classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('hidden');

        const players = Object.values(data.allPlayers).map(p => ({ id: p.id, name: p.name }));
        updatePlayersList(players);
        setupMultiplayerListeners();
    });

    socket.on('error', (data) => {
        alert(data.message);
    });
};

// ========== INICIAR JOGO MULTIPLAYER ==========
window.startMultiplayerGame = function () {
    socket.emit('start-game');
};

// ========== ATUALIZAR LISTA DE JOGADORES ==========
function updatePlayersList(players) {
    const list = document.getElementById('players-list');
    const count = document.getElementById('lobby-player-count');

    count.innerText = players.length;
    list.innerHTML = '';

    players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerText = `🎮 ${p.name}`;
        list.appendChild(item);
    });
}

// ========== CONFIGURAR LISTENERS MULTIPLAYER ==========
function setupMultiplayerListeners() {
    socket.on('player-joined', (data) => {
        const currentPlayers = Array.from(document.querySelectorAll('.player-item')).map(el => el.innerText.replace('🎮 ', ''));
        currentPlayers.push(data.playerState.name);
        updatePlayersList(currentPlayers.map((name, i) => ({ id: i, name })));
    });

    socket.on('player-left', (data) => {
        const currentPlayers = Array.from(document.querySelectorAll('.player-item')).map(el => el.innerText.replace('🎮 ', ''));
        const updatedPlayers = currentPlayers.filter(name => name !== data.playerName);
        updatePlayersList(updatedPlayers.map((name, i) => ({ id: i, name })));

        // Remover jogador da cena
        if (remotePlayers.has(data.playerId)) {
            const playerData = remotePlayers.get(data.playerId);
            scene.remove(playerData.model);
            if (playerData.nametag) playerData.nametag.remove();
            remotePlayers.delete(data.playerId);
        }
    });

    socket.on('game-started', (data) => {
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('game-container').style.display = 'block';
        document.getElementById('hud').style.display = 'block';

        cfg.sens = parseInt(document.getElementById('cfg-sens').value) * 0.0003;
        cfg.fov = parseInt(document.getElementById('cfg-fov').value);

        setupThree();
        setupMinimap();
        isPlaying = true;
        startZoneTimer();

        // Criar jogadores remotos
        Object.values(data.players).forEach(playerState => {
            if (playerState.id !== myPlayerId) {
                createRemotePlayer(playerState);
            }
        });
    });

    socket.on('player-moved', (data) => {
        if (remotePlayers.has(data.playerId)) {
            const remotePlayer = remotePlayers.get(data.playerId);
            remotePlayer.state = { position: data.position, rotation: data.rotation };
        }
    });

    socket.on('players-state', (playersState) => {
        Object.entries(playersState).forEach(([playerId, state]) => {
            if (playerId !== myPlayerId && remotePlayers.has(playerId)) {
                const remotePlayer = remotePlayers.get(playerId);
                remotePlayer.state = state;
            }
        });
    });

    socket.on('bullet-fired', (data) => {
        if (data.shooterId !== myPlayerId) {
            // Criar bala visual
            spawnBullet('remote', new THREE.Vector3(data.from.x, data.from.y, data.from.z), new THREE.Vector3(data.to.x, data.to.y, data.to.z), data.shooterId);
        }
    });

    socket.on('player-eliminated', (data) => {
        addKillLog(`${data.killerName} ⚔️ ${data.victimName}`);

        if (data.victimId === myPlayerId) {
            showMsg("ELIMINADO", `Você foi eliminado por ${data.killerName}`);
        }

        // Remover jogador eliminado
        if (remotePlayers.has(data.victimId)) {
            const playerData = remotePlayers.get(data.victimId);
            scene.remove(playerData.model);
            if (playerData.nametag) playerData.nametag.remove();
            remotePlayers.delete(data.victimId);
        }
    });

    socket.on('player-damaged', (data) => {
        if (data.playerId === myPlayerId) {
            health = data.health;
            armor = data.armor;
            triggerHitmarker();
        }
    });

    socket.on('zone-update', (data) => {
        zoneRadius = data.radius;
        zoneMesh.scale.set(zoneRadius, 1, zoneRadius);

        const timerEl = document.getElementById('timer-display');
        if (data.paused) {
            timerEl.innerText = `PRÓX. ZONA EM: ${data.pauseTime}s`;
        } else {
            timerEl.innerText = `ZONA EM MOVIMENTO`;
        }
    });

    socket.on('grenade-thrown', (data) => {
        if (data.playerId !== myPlayerId) {
            const g = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), new THREE.MeshStandardMaterial({ color: data.type === 'explosive' ? 0x222222 : 0xeeeeee }));
            g.position.set(data.position.x, data.position.y, data.position.z);
            g.userData = { vel: new THREE.Vector3(data.velocity.x, data.velocity.y, data.velocity.z), life: 120, type: data.type, hasStopped: false };
            scene.add(g);
            grenades.push(g);
        }
    });

    socket.on('game-over', (data) => {
        if (data.winnerId === myPlayerId) {
            showMsg("BOOYAH!", "Você venceu a partida!");
        } else {
            showMsg("DERROTA", `${data.winnerName} venceu a partida`);
        }
    });
}

// ========== CRIAR JOGADOR REMOTO ==========
function createRemotePlayer(playerState) {
    const model = createHumanoid(0x1d7f7f, playerState.id); // Cor diferente para jogadores
    model.position.set(playerState.position.x, playerState.position.y, playerState.position.z);
    scene.add(model);

    // Criar nametag
    const nametag = document.createElement('div');
    nametag.className = 'nametag';
    nametag.innerText = playerState.name;
    document.body.appendChild(nametag);

    remotePlayers.set(playerState.id, {
        model,
        nametag,
        state: playerState
    });
}

// ========== ENVIAR MOVIMENTO (chamar no loop de animação) ==========
function sendPlayerMovement() {
    if (isMultiplayer && socket && myPlayerId) {
        socket.emit('player-move', {
            position: { x: playerGroup.position.x, y: playerGroup.position.y, z: playerGroup.position.z },
            rotation: { yaw: cameraYaw, pitch: cameraPitch }
        });
    }
}

// ========== ENVIAR TIRO (chamar quando atirar) ==========
function sendPlayerShoot(from, to, hitPlayerId) {
    if (isMultiplayer && socket) {
        socket.emit('player-shoot', {
            from: { x: from.x, y: from.y, z: from.z },
            to: { x: to.x, y: to.y, z: to.z },
            weaponType: currentWeapon,
            hitPlayerId: hitPlayerId || null
        });
    }
}

// ========== ENVIAR GRANADA (chamar quando jogar granada) ==========
function sendGrenadeThrow(position, velocity, type) {
    if (isMultiplayer && socket) {
        socket.emit('throw-grenade', {
            position: { x: position.x, y: position.y, z: position.z },
            velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
            type: type
        });
    }
}

// ========== ATUALIZAR JOGADORES REMOTOS (chamar no loop de animação) ==========
function updateRemotePlayers() {
    if (!isMultiplayer) return;

    remotePlayers.forEach((playerData, playerId) => {
        if (playerData.state) {
            // Interpolar posição para suavizar movimento
            playerData.model.position.lerp(new THREE.Vector3(playerData.state.position.x, playerData.state.position.y, playerData.state.position.z), 0.3);

            // Rotação
            if (playerData.state.rotation) {
                playerData.model.rotation.y = THREE.MathUtils.lerp(playerData.model.rotation.y, playerData.state.rotation.yaw, 0.3);
            }

            // Atualizar posição da nametag
            if (playerData.nametag && camera) {
                const screenPos = playerData.model.position.clone();
                screenPos.y += 6; // Acima da cabeça
                screenPos.project(camera);

                const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
                const y = (screenPos.y * -0.5 + 0.5) * window.innerHeight;

                playerData.nametag.style.left = `${x}px`;
                playerData.nametag.style.top = `${y - 20}px`;
                playerData.nametag.style.display = screenPos.z < 1 ? 'block' : 'none';
            }
        }
    });

    // Atualizar ping
    if (socket) {
        const now = Date.now();
        if (now - lastPingTime > 1000) {
            lastPingTime = now;
            const start = Date.now();
            socket.emit('ping', start);
            socket.once('pong', () => {
                currentPing = Date.now() - start;
                document.getElementById('ping-value').innerText = currentPing;
            });
        }
    }
}

// LEMBRETE: Adicionar no loop de animação:
// if (isMultiplayer) {
//     sendPlayerMovement();
//     updateRemotePlayers();
// }
//
// E ao atirar:
// sendPlayerShoot(from, to, hitPlayerIdOrNull);
//
// E ao jogar granada:
// sendGrenadeThrow(position, velocity, grenadeType);
