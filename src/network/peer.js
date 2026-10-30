// WebRTC Peer-to-Peer Networking for 2 Separate Mobile Phones via Room Codes

import { Peer } from 'peerjs';

const PEER_PREFIX = 'nkc_room_';

export class NetworkManager {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = null;
    this.onConnected = null;
    this.onDisconnected = null;
    this.onMessage = null;
    this.ping = 0;
    this.lastPingSent = 0;
    this.pingInterval = null;
  }

  // Generate a clean 4-character room code (e.g. 'NEON', 'BOLT')
  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous 0/O or 1/I
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Host creates a room
  hostRoom(roomCode, callbacks = {}) {
    this.isHost = true;
    this.roomCode = (roomCode || this.generateCode()).toUpperCase();
    this.setCallbacks(callbacks);

    const peerId = `${PEER_PREFIX}${this.roomCode}`;

    return new Promise((resolve, reject) => {
      this.peer = new Peer(peerId, {
        debug: 1,
      });

      this.peer.on('open', (id) => {
        resolve(this.roomCode);
      });

      this.peer.on('connection', (connection) => {
        this.conn = connection;
        this.setupConnection();
      });

      this.peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          // Code collision, retry with a fresh random code
          this.peer.destroy();
          this.hostRoom(null, callbacks).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  // Guest joins room with 4-letter code
  joinRoom(roomCode, callbacks = {}) {
    this.isHost = false;
    this.roomCode = roomCode.trim().toUpperCase();
    this.setCallbacks(callbacks);

    const hostPeerId = `${PEER_PREFIX}${this.roomCode}`;

    return new Promise((resolve, reject) => {
      this.peer = new Peer({
        debug: 1,
      });

      this.peer.on('open', () => {
        this.conn = this.peer.connect(hostPeerId, {
          reliable: false, // Unreliable/UDP mode for 60fps gaming latency
        });

        this.setupConnection();

        this.conn.on('open', () => {
          resolve(this.roomCode);
        });

        setTimeout(() => {
          if (!this.conn || !this.conn.open) {
            reject(new Error('Room not found or timed out. Please check the code.'));
          }
        }, 10000);
      });

      this.peer.on('error', (err) => {
        reject(err);
      });
    });
  }

  setCallbacks({ onConnected, onDisconnected, onMessage }) {
    this.onConnected = onConnected;
    this.onDisconnected = onDisconnected;
    this.onMessage = onMessage;
  }

  setupConnection() {
    this.conn.on('open', () => {
      if (this.onConnected) this.onConnected({ isHost: this.isHost, roomCode: this.roomCode });
      this.startPingMonitor();
    });

    this.conn.on('data', (data) => {
      if (data.type === 'PING') {
        this.send({ type: 'PONG', ts: data.ts });
      } else if (data.type === 'PONG') {
        this.ping = Math.max(1, Math.round(Date.now() - data.ts));
      } else if (this.onMessage) {
        this.onMessage(data);
      }
    });

    this.conn.on('close', () => {
      this.stopPingMonitor();
      if (this.onDisconnected) this.onDisconnected();
    });

    this.conn.on('error', () => {
      this.stopPingMonitor();
      if (this.onDisconnected) this.onDisconnected();
    });
  }

  startPingMonitor() {
    this.stopPingMonitor();
    this.pingInterval = setInterval(() => {
      if (this.conn && this.conn.open) {
        this.send({ type: 'PING', ts: Date.now() });
      }
    }, 2000);
  }

  stopPingMonitor() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }

  disconnect() {
    this.stopPingMonitor();
    if (this.conn) {
      try { this.conn.close(); } catch {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }
  }
}

export const network = new NetworkManager();
