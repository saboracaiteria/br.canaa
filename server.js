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
  constructor(code, maxPlayers = 50) {
    this.code = code;
    this.maxPlayers = maxPlayers;
    this.players = new Map(); // playerId -> PlayerState
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
      currentWeapon: 'AR',
      lastUpdate: Date.now()
    };
    
    this.players.set(playerId, playerState);
    return playerState;
  }

  removePlayer(playerId) {
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
        kills: player.kills,
        currentWeapon: player.currentWeapon
      };
    });
    return states;
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
      if (player.alive) {
        const dist = Math.sqrt(player.position.x ** 2 + player.position.z ** 2);
        if (dist > this.zoneRadius) {
          player.health -= 0.05;
          if (player.health <= 0) {
            player.alive = false;
            player.health = 0;
          }
        }
      }
    });
  }

  startGame() {
    this.gameStarted = true;
    this.zoneShrinking = true;
    console.log(`[SALA ${this.code}] Jogo iniciado com ${this.players.size} jogadores`);
  }
}

// ============================================
// EVENTOS SOCKET.IO
// ============================================

io.on('connection', (socket) => {
  console.log(`[CONEXÃO] Cliente conectado: ${socket.id}`);

  // ========== CRIAR SALA ==========
  socket.on('create-room', ({ playerName, maxPlayers }) => {
    const roomCode = generateRoomCode();
    const room = new Room(roomCode, maxPlayers || 50);
    rooms.set(roomCode, room);
    
    const playerState = room.addPlayer(socket.id, playerName);
    players.set(socket.id, { playerId: playerState.id, roomCode: roomCode });
    
    socket.join(roomCode);
    
    socket.emit('room-created', {
      roomCode: roomCode,
      playerId: playerState.id,
      playerState: playerState
    });
    
    console.log(`[SALA CRIADA] ${roomCode} por ${playerName}`);
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
      allPlayers: room.getPlayerStates()
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
    
    if (room.players.size < 2) {
      socket.emit('error', { message: 'Mínimo 2 jogadores para iniciar' });
      return;
    }
    
    room.startGame();
    io.to(playerData.roomCode).emit('game-started', {
      players: room.getPlayerStates()
    });
  });

  // ========== ATUALIZAR POSIÇÃO ==========
  socket.on('player-move', (data) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomCode);
    if (!room) return;
    
    const player = room.players.get(playerData.playerId);
    if (!player || !player.alive) return;
    
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
    if (!shooter || !shooter.alive) return;
    
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
      if (target && target.alive) {
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
          target.health = 0;
          target.alive = false;
          shooter.kills++;
          
          io.to(playerData.roomCode).emit('player-eliminated', {
            victimId: data.hitPlayerId,
            victimName: target.name,
            killerId: playerData.playerId,
            killerName: shooter.name
          });
          
          // Verificar vencedor
          const aliveCount = room.getAliveCount();
          if (aliveCount === 1) {
            const winner = Array.from(room.players.values()).find(p => p.alive);
            io.to(playerData.roomCode).emit('game-over', {
              winnerId: winner.id,
              winnerName: winner.name
            });
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
      // Atualizar zona
      room.updateZone(delta);
      
      // Enviar estado da zona
      io.to(roomCode).emit('zone-update', {
        radius: room.zoneRadius,
        center: room.zoneCenter,
        paused: room.gasPauseTimer > 0,
        pauseTime: Math.ceil(room.gasPauseTimer)
      });
      
      // Enviar estados dos jogadores (incluindo HP/Armor)
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
  `);
});
