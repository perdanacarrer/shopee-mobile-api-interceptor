import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { DeviceConfig } from './device-farm';
import * as crypto from 'crypto';

export interface Session {
  id: string;
  deviceId: string;
  token: string;
  refreshToken: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsed: Date;
  isActive: boolean;
  useCount: number;
  email: string;
  password: string;
}

export interface SessionConfig {
  maxSessions: number;
  tokenRefreshThreshold: number;
  maxSessionAge: number;
  maxUsesPerSession: number;
}

export class SessionPool extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private config: SessionConfig;
  private refreshQueue: string[] = [];
  private isRefreshing: boolean = false;

  constructor(config: Partial<SessionConfig> = {}) {
    super();
    
    this.config = {
      maxSessions: 100,
      tokenRefreshThreshold: 300,
      maxSessionAge: 86400,
      maxUsesPerSession: 1000,
      ...config,
    };
  }

  async createSession(device: DeviceConfig, tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }): Promise<Session> {
    const session: Session = {
      id: this.generateSessionId(device.id),
      deviceId: device.id,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      lastUsed: new Date(),
      isActive: true,
      useCount: 0,
      email: device.email,
      password: device.password,
    };

    this.sessions.set(session.id, session);
    
    if (this.sessions.size > this.config.maxSessions) {
      this.cleanupOldestSessions();
    }

    logger.info(`Session created for device ${device.id}`, { sessionId: session.id });
    this.emit('session-created', session);

    return session;
  }

  getSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (session && session.isActive) {
      return session;
    }
    return null;
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(s => s.isActive);
  }

  async getValidToken(sessionId: string): Promise<string | null> {
    const session = this.getSession(sessionId);
    if (!session) return null;

    if (this.needsRefresh(session)) {
      const refreshed = await this.refreshSessionToken(sessionId);
      if (refreshed) {
        return refreshed.token;
      }
      return null;
    }

    const age = (Date.now() - session.createdAt.getTime()) / 1000;
    if (age > this.config.maxSessionAge) {
      await this.invalidateSession(sessionId);
      return null;
    }

    if (session.useCount >= this.config.maxUsesPerSession) {
      await this.invalidateSession(sessionId);
      return null;
    }

    session.useCount++;
    session.lastUsed = new Date();

    return session.token;
  }

  private needsRefresh(session: Session): boolean {
    const timeUntilExpiry = (session.expiresAt.getTime() - Date.now()) / 1000;
    return timeUntilExpiry < this.config.tokenRefreshThreshold;
  }

  async refreshSessionToken(sessionId: string): Promise<Session | null> {
    const session = this.getSession(sessionId);
    if (!session) return null;

    try {
      const newToken = this.generateToken();
      const newRefreshToken = this.generateToken();
      
      session.token = newToken;
      session.refreshToken = newRefreshToken;
      session.expiresAt = new Date(Date.now() + 86400 * 1000);
      session.lastUsed = new Date();

      logger.info(`Session ${sessionId} token refreshed`);
      this.emit('session-refreshed', session);

      return session;
    } catch (error) {
      logger.error(`Failed to refresh session ${sessionId}`, { error });
      await this.invalidateSession(sessionId);
      return null;
    }
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      logger.info(`Session ${sessionId} invalidated`);
      this.emit('session-invalidated', session);
    }
  }

  private cleanupOldestSessions(): void {
    const sessions = Array.from(this.sessions.values())
      .filter(s => s.isActive)
      .sort((a, b) => a.lastUsed.getTime() - b.lastUsed.getTime());
    
    while (sessions.length > this.config.maxSessions * 0.8) {
      const oldest = sessions.shift();
      if (oldest) {
        this.invalidateSession(oldest.id);
      }
    }
  }

  getSessionStats(): any {
    const sessions = Array.from(this.sessions.values());
    const activeSessions = sessions.filter(s => s.isActive);
    
    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      expiredSessions: sessions.filter(s => !s.isActive).length,
      averageAge: activeSessions.length > 0
        ? activeSessions.reduce((sum, s) => 
            sum + (Date.now() - s.createdAt.getTime()), 0) / activeSessions.length / 1000
        : 0,
      averageUses: activeSessions.length > 0
        ? activeSessions.reduce((sum, s) => sum + s.useCount, 0) / activeSessions.length
        : 0,
      refreshNeeded: activeSessions.filter(s => this.needsRefresh(s)).length,
    };
  }

  private generateSessionId(deviceId: string): string {
    return `session_${deviceId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private generateToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  async startAutoRefresh(interval: number = 300000): Promise<NodeJS.Timeout> {
    return setInterval(() => {
      this.refreshAllSessions();
    }, interval);
  }

  async refreshAllSessions(): Promise<void> {
    if (this.isRefreshing) return;
    
    this.isRefreshing = true;
    
    try {
      const sessions = Array.from(this.sessions.values())
        .filter(s => s.isActive && this.needsRefresh(s));
      
      for (const session of sessions) {
        await this.refreshSessionToken(session.id);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      logger.info(`Refreshed ${sessions.length} sessions`);
    } catch (error) {
      logger.error('Failed to refresh sessions', { error });
    } finally {
      this.isRefreshing = false;
    }
  }

  async destroy(): Promise<void> {
    this.sessions.clear();
    this.refreshQueue = [];
    logger.info('Session pool destroyed');
  }
}

export default SessionPool;