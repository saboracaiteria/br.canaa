const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Servir arquivos estáticos (HTML do jogo)
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

// ============================================
// ESTRUTURA DE DADOS
// ============================================
const rooms = new Map(); // roomCode -> Room
const players = new Map(); // socketId -> Player

class Room {
  constructor(code, options = {}) {
    this.code = code;
    this.hostId = options.hostId || null;
    this.maxPlayers = options.maxPlayers || 50;
    this.isPublic = options.isPublic !== undefined ? options.isPublic : true;
    this.gameMode = options.gameMode || 'solo'; // 'solo', 'duo', 'squad'
    this.botCount = options.botCount || 0;
    this.botDifficulty = options.botDifficulty || 2;
    this.players = new Map(); // playerId -> PlayerState
    this.teams = new Map(); // teamId -> [playerIds]
    this.gameStarted = false;
    this.zoneRadius = 500;
    this.zoneCenter = { x: 0, z: 0 };
    this.zoneShrinking = false;
    this.gasPauseCount = 0;
    this.gasPauseTimer = 0;
    this.createdAt = Date.now();
  }

  addPlayer(socketId, name) {
    const playerId = uuidv4();
    const playerState = {
      id: playerId,
      socketId: socketId,
      name: name,
      position: { x: 30, y: 2, z: 0 },
      rotation: { yaw: 0, pitch: 0 },
      health: 100,
      armor: 100,
      kills: 0,
      alive: true,
      lives: 5, // NOVO: 5 vidas
      isRespawning: false, // NOVO
      respawnTimer: 0, // NOVO
      teamId: null, // NOVO
      currentWeapon: 'AR',
      lastUpdate: Date.now()
    };

    this.players.set(playerId, playerState);

    // Atribuir equipe se for modo duo/squad
    if (this.gameMode !== 'solo' && !this.gameStarted) {
      this.assignTeam(playerId);
    }

    return playerState;
  }

  assignTeam(playerId) {
    const playersPerTeam = this.gameMode === 'duo' ? 2 : 4;

    // Procurar equipe disponível
    for (let [teamId, members] of this.teams) {
      if (members.length < playersPerTeam) {
        members.push(playerId);
        const player = this.players.get(playerId);
        if (player) player.teamId = teamId;
        return teamId;
      }
    }

    // Criar nova equipe
    const newTeamId = uuidv4();
    this.teams.set(newTeamId, [playerId]);
    const player = this.players.get(playerId);
    if (player) player.teamId = newTeamId;
    return newTeamId;
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);

    // Remover da equipe
    if (player && player.teamId) {
      const team = this.teams.get(player.teamId);
      if (team) {
        const index = team.indexOf(playerId);
        if (index > -1) team.splice(index, 1);

        // Remover equipe se vazia
        if (team.length === 0) {
          this.teams.delete(player.teamId);
        }
      }
    }

    this.players.delete(playerId);

    // Se sala ficar vazia, marcar para limpeza
    if (this.players.size === 0) {
      return true; // Indica que sala deve ser removida
    }
    return false;
  }

  getAliveCount() {
    return Array.from(this.players.values()).filter(p => p.alive).length;
  }

  getPlayerStates() {
    const states = {};
    this.players.forEach((player, id) => {
      states[id] = {
        id: player.id,
        name: player.name,
        position: player.position,
        rotation: player.rotation,
        health: player.health,
        armor: player.armor,
        alive: player.alive,
        lives: player.lives,
        isRespawning: player.isRespawning,
        respawnTimer: player.respawnTimer,
        teamId: player.teamId,
        kills: player.kills,
        currentWeapon: player.currentWeapon
      };
    });
    return states;
  }

  getRoomInfo() {
    return {
      code: this.code,
      isPublic: this.isPublic,
      gameMode: this.gameMode,
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers,
      gameStarted: this.gameStarted,
      hostName: this.hostId ? (this.players.get(this.hostId)?.name || 'Host') : 'Host'
    };
  }

  updateRespawns(delta) {
    this.players.forEach(player => {
      if (player.isRespawning) {
        player.respawnTimer -= delta;
        if (player.respawnTimer <= 0) {
          // Respawn
          player.isRespawning = false;
          player.alive = true;
          player.health = 100;
          player.armor = 100;
          // Spawn em posição aleatória segura
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * 100 + 50;
          player.position = {
            x: Math.cos(angle) * dist,
            y: 2,
            z: Math.sin(angle) * dist
          };
        }
      }
    });
  }

  updateZone(delta) {
    if (!this.zoneShrinking) return;

    if (this.gasPauseTimer > 0) {
      this.gasPauseTimer -= delta;
      return;
    }

    // Pausas quando atingir certos raios
    if ((this.gasPauseCount === 0 && this.zoneRadius <= 350) ||
      (this.gasPauseCount === 1 && this.zoneRadius <= 150)) {
      this.gasPauseCount++;
      this.gasPauseTimer = 30;
    } else if (this.zoneRadius > 10) {
      this.zoneRadius -= 0.12;
    }

    // Aplicar dano aos jogadores fora da zona
    this.players.forEach(player => {
      if (player.alive && !player.isRespawning) {
        const dist = Math.sqrt(player.position.x ** 2 + player.position.z ** 2);
        if (dist > this.zoneRadius) {
          player.health -= 0.05;
          if (player.health <= 0) {
            this.handlePlayerDeath(player);
          }
        }
      }
    });
  }

  handlePlayerDeath(player, killerId = null) {
    player.health = 0;
    player.alive = false;
    player.lives--;

    if (player.lives > 0) {
      // Iniciar respawn
      player.isRespawning = true;
      player.respawnTimer = 5; // 5 segundos
      return { respawning: true, eliminated: false };
    } else {
      // Eliminado permanentemente
      return { respawning: false, eliminated: true };
    }
  }

  startGame() {
    this.gameStarted = true;
    this.zoneShrinking = true;
    console.log(`[SALA ${this.code}] Jogo iniciado - Modo: ${this.gameMode}, Jogadores: ${this.players.size}, Bots: ${this.botCount}`);
  }
}

// ============================================
// EVENTOS SOCKET.IO
// ============================================

io.on('connection', (socket) => {
  console.log(`[CONEXÃO] Cliente conectado: ${socket.id}`);

  // ========== LISTAR SALAS PÚBLICAS ==========
  socket.on('list-rooms', () => {
    const publicRooms = Array.from(rooms.values())
      .filter(room => room.isPublic && !room.gameStarted)
      .map(room => room.getRoomInfo());

    socket.emit('rooms-list', publicRooms);
  });

  // ========== CRIAR SALA ==========
  socket.on('create-room', ({ playerName, maxPlayers, isPublic, gameMode, botCount, botDifficulty }) => {
    const roomCode = generateRoomCode();
    const room = new Room(roomCode, {
      maxPlayers: maxPlayers || 50,
      isPublic: isPublic !== undefined ? isPublic : true,
      gameMode: gameMode || 'solo',
      botCount: botCount || 0,
      botDifficulty: botDifficulty || 2
    });

    rooms.set(roomCode, room);

    const playerState = room.addPlayer(socket.id, playerName);
    room.hostId = playerState.id;
    players.set(socket.id, { playerId: playerState.id, roomCode: roomCode });

    socket.join(roomCode);

    socket.emit('room-created', {
      roomCode: roomCode,
      playerId: playerState.id,
      playerState: playerState,
      roomInfo: room.getRoomInfo()
    });

    // Broadcast atualização de lista de salas
    if (room.isPublic) {
      io.emit('room-list-updated');
    }

    console.log(`[SALA CRIADA] ${roomCode} por ${playerName} - ${gameMode.toUpperCase()} - ${isPublic ? 'PÚBLICA' : 'PRIVADA'}`);
  });

  // ========== ENTRAR EM SALA ==========
  socket.on('join-room', ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('error', { message: 'Sala não encontrada' });
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      socket.emit('error', { message: 'Sala cheia' });
      return;
    }

    if (room.gameStarted) {
      socket.emit('error', { message: 'Jogo já iniciado' });
      return;
    }

    const playerState = room.addPlayer(socket.id, playerName);
    players.set(socket.id, { playerId: playerState.id, roomCode: roomCode });

    socket.join(roomCode);

    // Enviar estado atual para o novo jogador
    socket.emit('room-joined', {
      roomCode: roomCode,
      playerId: playerState.id,
      playerState: playerState,
      allPlayers: room.getPlayerStates(),
      roomInfo: room.getRoomInfo()
    });

    // Notificar outros jogadores
    socket.to(roomCode).emit('player-joined', {
      playerId: playerState.id,
      playerState: playerState
    });

    console.log(`[SALA ${roomCode}] ${playerName} entrou (${room.players.size}/${room.maxPlayers})`);
  });

  // ========== INICIAR JOGO ==========
  socket.on('start-game', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room) return;

    // Apenas o host pode iniciar
    if (room.hostId !== playerData.playerId) {
      socket.emit('error', { message: 'Apenas o host pode iniciar o jogo' });
      return;
    }

    room.startGame();
    io.to(playerData.roomCode).emit('game-started', {
      players: room.getPlayerStates(),
      botCount: room.botCount,
      botDifficulty: room.botDifficulty,
      gameMode: room.gameMode,
      teams: Object.fromEntries(room.teams)
    });

    // Atualizar lista de salas
    if (room.isPublic) {
      io.emit('room-list-updated');
    }
  });

  // ========== ATUALIZAR POSIÇÃO ==========
  socket.on('player-move', (data) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room) return;

    const player = room.players.get(playerData.playerId);
    if (!player || !player.alive || player.isRespawning) return;

    // Atualizar estado do jogador
    player.position = data.position;
    player.rotation = data.rotation;
    player.lastUpdate = Date.now();

    // Broadcast para outros jogadores
    socket.to(playerData.roomCode).emit('player-moved', {
      playerId: playerData.playerId,
      position: data.position,
      rotation: data.rotation
    });
  });

  // ========== ATIRAR ==========
  socket.on('player-shoot', (data) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room) return;

    const shooter = room.players.get(playerData.playerId);
    if (!shooter || !shooter.alive || shooter.isRespawning) return;

    // Broadcast do tiro para todos
    io.to(playerData.roomCode).emit('bullet-fired', {
      shooterId: playerData.playerId,
      from: data.from,
      to: data.to,
      weaponType: data.weaponType || 'AR'
    });

    // Verificar se acertou algum jogador (validação server-side)
    if (data.hitPlayerId) {
      const target = room.players.get(data.hitPlayerId);
      if (target && target.alive && !target.isRespawning) {

        // Verificar friendly fire (não permitido)
        if (shooter.teamId && shooter.teamId === target.teamId) {
          return; // Não aplicar dano em membros da mesma equipe
        }

        const damage = data.weaponType === 'SNIPER' ? 400 : 50;

        // Aplicar dano
        if (target.armor > 0) {
          target.armor -= damage * 1.5;
          if (target.armor < 0) {
            target.health += target.armor / 1.5;
            target.armor = 0;
          }
        } else {
          target.health -= damage;
        }

        // Verificar eliminação
        if (target.health <= 0) {
          const deathResult = room.handlePlayerDeath(target, playerData.playerId);
          shooter.kills++;

          if (deathResult.respawning) {
            // Morreu mas vai respawnar
            io.to(playerData.roomCode).emit('player-died', {
              victimId: data.hitPlayerId,
              victimName: target.name,
              killerId: playerData.playerId,
              killerName: shooter.name,
              livesRemaining: target.lives,
              respawnTime: 5
            });
          } else {
            // Eliminado permanentemente
            io.to(playerData.roomCode).emit('player-eliminated', {
              victimId: data.hitPlayerId,
              victimName: target.name,
              killerId: playerData.playerId,
              killerName: shooter.name
            });

            // Verificar condição de vitória
            checkWinCondition(room, playerData.roomCode);
          }
        }

        // Enviar atualização de dano
        io.to(playerData.roomCode).emit('player-damaged', {
          playerId: data.hitPlayerId,
          health: target.health,
          armor: target.armor,
          shooterId: playerData.playerId
        });
      }
    }
  });

  // ========== RESPAWN ==========
  socket.on('request-respawn', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room) return;

    const player = room.players.get(playerData.playerId);
    if (!player || player.lives <= 0 || !player.isRespawning) return;

    // O respawn acontece automaticamente via update loop
  });

  // ========== JOGAR GRANADA ==========
  socket.on('throw-grenade', (data) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room) return;

    // Broadcast da granada para todos
    io.to(playerData.roomCode).emit('grenade-thrown', {
      playerId: playerData.playerId,
      position: data.position,
      velocity: data.velocity,
      type: data.type
    });
  });

  // ========== TROCAR ARMA ==========
  socket.on('switch-weapon', (data) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room) return;

    const player = room.players.get(playerData.playerId);
    if (player) {
      player.currentWeapon = data.weaponType;
    }
  });

  // ========== WEBRTC SIGNALING (VOICE CHAT) ==========
  socket.on('voice-offer', ({ targetId, offer }) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room) return;

    const target = room.players.get(targetId);
    if (target) {
      io.to(target.socketId).emit('voice-offer', {
        fromId: playerData.playerId,
        offer: offer
      });
    }
  });

  socket.on('voice-answer', ({ targetId, answer }) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room) return;

    const target = room.players.get(targetId);
    if (target) {
      io.to(target.socketId).emit('voice-answer', {
        fromId: playerData.playerId,
        answer: answer
      });
    }
  });

  socket.on('voice-ice-candidate', ({ targetId, candidate }) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room) return;

    const target = room.players.get(targetId);
    if (target) {
      io.to(target.socketId).emit('voice-ice-candidate', {
        fromId: playerData.playerId,
        candidate: candidate
      });
    }
  });

  // ========== DESCONEXÃO ==========
  socket.on('disconnect', () => {
    const playerData = players.get(socket.id);
    if (playerData) {
      const room = rooms.get(playerData.roomCode);
      if (room) {
        const player = room.players.get(playerData.playerId);
        const playerName = player ? player.name : 'Jogador';

        const shouldRemoveRoom = room.removePlayer(playerData.playerId);

        // Notificar outros jogadores
        socket.to(playerData.roomCode).emit('player-left', {
          playerId: playerData.playerId,
          playerName: playerName
        });

        if (shouldRemoveRoom) {
          rooms.delete(playerData.roomCode);
          console.log(`[SALA REMOVIDA] ${playerData.roomCode}`);
          // Atualizar lista de salas
          io.emit('room-list-updated');
        } else {
          // Verificar condição de vitória após saída
          checkWinCondition(room, playerData.roomCode);
        }
      }
      players.delete(socket.id);
    }
    console.log(`[DESCONEXÃO] Cliente desconectado: ${socket.id}`);
  });
});

// ============================================
// LOOP DE ATUALIZAÇÃO DO SERVIDOR (60Hz)
// ============================================
let lastUpdate = Date.now();
setInterval(() => {
  const now = Date.now();
  const delta = (now - lastUpdate) / 1000;
  lastUpdate = now;

  rooms.forEach((room, roomCode) => {
    if (room.gameStarted) {
      // Atualizar respawns
      room.updateRespawns(delta);

      // Atualizar zona
      room.updateZone(delta);

      // Enviar estado da zona
      io.to(roomCode).emit('zone-update', {
        radius: room.zoneRadius,
        center: room.zoneCenter,
        paused: room.gasPauseTimer > 0,
        pauseTime: Math.ceil(room.gasPauseTimer)
      });

      // Enviar estados dos jogadores (incluindo HP/Armor/Lives/Respawn)
      io.to(roomCode).emit('players-state', room.getPlayerStates());
    }
  });
}, 1000 / 60); // 60 atualizações por segundo

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Garantir código único
  if (rooms.has(code)) {
    return generateRoomCode();
  }

  return code;
}

function checkWinCondition(room, roomCode) {
  if (!room.gameStarted) return;

  if (room.gameMode === 'solo') {
    // Solo: último jogador vivo vence
    const aliveCount = room.getAliveCount();
    if (aliveCount === 1) {
      const winner = Array.from(room.players.values()).find(p => p.alive);
      if (winner) {
        io.to(roomCode).emit('game-over', {
          winnerId: winner.id,
          winnerName: winner.name,
          teamId: null
        });
      }
    }
  } else {
    // Duo/Squad: última equipe com membros vivos vence
    const aliveTeams = new Set();
    room.players.forEach(player => {
      if (player.alive && player.teamId) {
        aliveTeams.add(player.teamId);
      }
    });

    if (aliveTeams.size === 1) {
      const winningTeamId = Array.from(aliveTeams)[0];
      const teamMembers = Array.from(room.players.values())
        .filter(p => p.teamId === winningTeamId);

      io.to(roomCode).emit('game-over', {
        winnerId: null,
        winnerName: null,
        teamId: winningTeamId,
        teamMembers: teamMembers.map(p => ({ id: p.id, name: p.name, kills: p.kills }))
      });
    }
  }
}

// ============================================
// INICIAR SERVIDOR
// ============================================
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   RESIDENCIAL CANAÃ - SERVIDOR MULTIPLAYER ║
╚═══════════════════════════════════════════╝

🚀 Servidor rodando em http://localhost:${PORT}
🎮 Aguardando jogadores...
✨ Recursos: Vidas, Duo/Squad, Salas Públicas/Privadas, Voice Chat
  `);
});
