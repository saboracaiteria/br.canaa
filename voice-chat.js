// ============================================
// VOICE CHAT MODULE - WebRTC Voice Communication
// ============================================

class VoiceChat {
    constructor(socket, myPlayerId) {
        this.socket = socket;
        this.myPlayerId = myPlayerId;
        this.peers = new Map(); // peerId -> RTCPeerConnection
        this.streams = new Map(); // peerId -> MediaStream
        this.localStream = null;
        this.isMuted = true; // Começa mutado
        this.pushToTalkActive = false;
        this.volumeLevels = new Map(); // peerId -> volume (0-1)

        this.setupSocketListeners();
    }

    // Inicializar áudio local
    async initialize() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            // Começar mutado
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = false;
            });

            console.log('[VOICE CHAT] Microfone inicializado');
            return true;
        } catch (error) {
            console.error('[VOICE CHAT] Erro ao acessar microfone:', error);
            return false;
        }
    }

    // Conectar com outros jogadores
    async connectToPeers(playerIds) {
        for (const peerId of playerIds) {
            if (peerId !== this.myPlayerId && !this.peers.has(peerId)) {
                await this.createPeerConnection(peerId, true);
            }
        }
    }

    // Criar conexão peer-to-peer
    async createPeerConnection(peerId, isInitiator) {
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        const pc = new RTCPeerConnection(config);
        this.peers.set(peerId, pc);

        // Adicionar stream local
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        // Receber stream remoto
        pc.ontrack = (event) => {
            console.log(`[VOICE CHAT] Stream recebido de ${peerId}`);
            const remoteStream = event.streams[0];
            this.streams.set(peerId, remoteStream);
            this.playRemoteAudio(peerId, remoteStream);
        };

        // ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('voice-ice-candidate', {
                    targetId: peerId,
                    candidate: event.candidate
                });
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log(`[VOICE CHAT] Estado ICE com ${peerId}: ${pc.iceConnectionState}`);
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                this.removePeer(peerId);
            }
        };

        // Se inicializador, criar oferta
        if (isInitiator) {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.socket.emit('voice-offer', {
                    targetId: peerId,
                    offer: offer
                });
            } catch (error) {
                console.error(`[VOICE CHAT] Erro ao criar oferta para ${peerId}:`, error);
            }
        }

        return pc;
    }

    // Reproduzir áudio remoto
    playRemoteAudio(peerId, stream) {
        let audioElement = document.getElementById(`voice-${peerId}`);

        if (!audioElement) {
            audioElement = document.createElement('audio');
            audioElement.id = `voice-${peerId}`;
            audioElement.autoplay = true;
            audioElement.volume = this.volumeLevels.get(peerId) || 1.0;
            document.body.appendChild(audioElement);
        }

        audioElement.srcObject = stream;
    }

    // Ativar/desativar push-to-talk
    setPushToTalk(active) {
        this.pushToTalkActive = active;

        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = active && !this.isMuted;
            });
        }

        // Emitir evento visual para outros verem que está falando
        if (active) {
            this.socket.emit('voice-speaking', { speaking: true });
        } else {
            this.socket.emit('voice-speaking', { speaking: false });
        }
    }

    // Toggle mute
    toggleMute() {
        this.isMuted = !this.isMuted;

        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted && this.pushToTalkActive;
            });
        }

        return this.isMuted;
    }

    // Ajustar volume de um peer específico
    setPeerVolume(peerId, volume) {
        this.volumeLevels.set(peerId, volume);
        const audioElement = document.getElementById(`voice-${peerId}`);
        if (audioElement) {
            audioElement.volume = volume;
        }
    }

    // Remover peer
    removePeer(peerId) {
        const pc = this.peers.get(peerId);
        if (pc) {
            pc.close();
            this.peers.delete(peerId);
        }

        this.streams.delete(peerId);

        const audioElement = document.getElementById(`voice-${peerId}`);
        if (audioElement) {
            audioElement.remove();
        }

        console.log(`[VOICE CHAT] Peer ${peerId} removido`);
    }

    // Configurar listeners do socket
    setupSocketListeners() {
        // Receber oferta
        this.socket.on('voice-offer', async ({ fromId, offer }) => {
            console.log(`[VOICE CHAT] Oferta recebida de ${fromId}`);

            let pc = this.peers.get(fromId);
            if (!pc) {
                pc = await this.createPeerConnection(fromId, false);
            }

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                this.socket.emit('voice-answer', {
                    targetId: fromId,
                    answer: answer
                });
            } catch (error) {
                console.error(`[VOICE CHAT] Erro ao processar oferta de ${fromId}:`, error);
            }
        });

        // Receber resposta
        this.socket.on('voice-answer', async ({ fromId, answer }) => {
            console.log(`[VOICE CHAT] Resposta recebida de ${fromId}`);

            const pc = this.peers.get(fromId);
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                } catch (error) {
                    console.error(`[VOICE CHAT] Erro ao processar resposta de ${fromId}:`, error);
                }
            }
        });

        // Receber ICE candidate
        this.socket.on('voice-ice-candidate', async ({ fromId, candidate }) => {
            const pc = this.peers.get(fromId);
            if (pc) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    console.error(`[VOICE CHAT] Erro ao adicionar ICE candidate de ${fromId}:`, error);
                }
            }
        });

        // Jogador saiu
        this.socket.on('player-left', ({ playerId }) => {
            this.removePeer(playerId);
        });
    }

    // Limpar tudo
    destroy() {
        // Fechar todas as conexões peer
        this.peers.forEach((pc, peerId) => {
            this.removePeer(peerId);
        });

        // Parar stream local
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        console.log('[VOICE CHAT] Destruído');
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.VoiceChat = VoiceChat;
}
