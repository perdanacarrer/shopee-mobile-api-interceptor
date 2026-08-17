import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { logger } from './logger';

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol: 'http' | 'https' | 'socks4' | 'socks5';
  country?: string;
  city?: string;
  speed?: number;
  reliability?: number;
  lastUsed?: Date;
  isAlive: boolean;
}

export interface ProxyPoolConfig {
  minProxies: number;
  maxProxies: number;
  healthCheckInterval: number;
  maxFailures: number;
  banDuration: number;
  testUrl: string;
}

export interface ProxyHealth {
  proxyId: string;
  isAlive: boolean;
  latency: number;
  lastCheck: Date;
  failureCount: number;
  successCount: number;
  averageLatency: number;
  uptime: number; // percentage
}

export class ProxyUtils extends EventEmitter {
  private static instance: ProxyUtils;
  private proxies: Map<string, ProxyConfig> = new Map();
  private healthStatus: Map<string, ProxyHealth> = new Map();
  private bannedProxies: Set<string> = new Set();
  private config: ProxyPoolConfig;
  private isRunning: boolean = false;

  private constructor(config: Partial<ProxyPoolConfig> = {}) {
    super();
    
    this.config = {
      minProxies: 10,
      maxProxies: 100,
      healthCheckInterval: 60000, // 1 minute
      maxFailures: 5,
      banDuration: 3600000, // 1 hour
      testUrl: 'https://api.shopee.co.id/api/v4/health',
      ...config,
    };

    this.loadProxies();
  }

  public static getInstance(config?: Partial<ProxyPoolConfig>): ProxyUtils {
    if (!ProxyUtils.instance) {
      ProxyUtils.instance = new ProxyUtils(config);
    }
    return ProxyUtils.instance;
  }

  private loadProxies(): void {
    const proxyFile = path.join(process.cwd(), 'data', 'proxies.json');
    
    if (fs.existsSync(proxyFile)) {
      try {
        const data = fs.readFileSync(proxyFile, 'utf8');
        const proxies = JSON.parse(data);
        
        proxies.forEach((proxy: ProxyConfig) => {
          const id = this.getProxyId(proxy);
          this.proxies.set(id, {
            ...proxy,
            isAlive: true,
          });
        });
        
        logger.info(`Loaded ${this.proxies.size} proxies from file`);
      } catch (error) {
        logger.error('Failed to load proxies', { error });
      }
    }
  }

  private saveProxies(): void {
    const proxyFile = path.join(process.cwd(), 'data', 'proxies.json');
    const dataDir = path.join(process.cwd(), 'data');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    try {
      const proxies = Array.from(this.proxies.values());
      fs.writeFileSync(proxyFile, JSON.stringify(proxies, null, 2));
      logger.info(`Saved ${proxies.length} proxies to file`);
    } catch (error) {
      logger.error('Failed to save proxies', { error });
    }
  }

  private getProxyId(proxy: ProxyConfig): string {
    return `${proxy.protocol}://${proxy.host}:${proxy.port}`;
  }

  addProxy(proxy: ProxyConfig): void {
    const id = this.getProxyId(proxy);
    this.proxies.set(id, {
      ...proxy,
      isAlive: true,
    });
    
    this.healthStatus.set(id, {
      proxyId: id,
      isAlive: true,
      latency: 0,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
      averageLatency: 0,
      uptime: 100,
    });
    
    this.saveProxies();
    logger.info(`Added proxy: ${id}`);
  }

  removeProxy(id: string): void {
    this.proxies.delete(id);
    this.healthStatus.delete(id);
    this.bannedProxies.delete(id);
    this.saveProxies();
    logger.info(`Removed proxy: ${id}`);
  }

  getProxy(): ProxyConfig | null {
    // Filter available proxies
    const available = Array.from(this.proxies.values())
      .filter(p => p.isAlive && !this.bannedProxies.has(this.getProxyId(p)));
    
    if (available.length === 0) {
      // Try to use banned proxies if no others available
      const banned = Array.from(this.proxies.values())
        .filter(p => this.bannedProxies.has(this.getProxyId(p)));
      
      if (banned.length > 0) {
        // Check if ban duration has passed
        const now = Date.now();
        const availableBanned = banned.filter(p => {
          const health = this.healthStatus.get(this.getProxyId(p));
          if (!health) return false;
          
          const bannedTime = health.lastCheck.getTime();
          return (now - bannedTime) > this.config.banDuration;
        });
        
        if (availableBanned.length > 0) {
          // Unban proxies
          availableBanned.forEach(p => {
            this.bannedProxies.delete(this.getProxyId(p));
          });
          return this.getProxy();
        }
      }
      
      return null;
    }
    
    // Select proxy based on performance
    const sorted = available.sort((a, b) => {
      const healthA = this.healthStatus.get(this.getProxyId(a));
      const healthB = this.healthStatus.get(this.getProxyId(b));
      
      if (!healthA || !healthB) return 0;
      
      // Prefer proxies with higher success rate and lower latency
      const scoreA = (healthA.successCount / (healthA.successCount + healthA.failureCount || 1)) * 
                    (1000 / (healthA.averageLatency || 1000));
      const scoreB = (healthB.successCount / (healthB.successCount + healthB.failureCount || 1)) * 
                    (1000 / (healthB.averageLatency || 1000));
      
      return scoreB - scoreA;
    });
    
    // Select random from top 3 for load balancing
    const top = sorted.slice(0, Math.min(3, sorted.length));
    const selected = top[Math.floor(Math.random() * top.length)];
    
    // Update last used
    selected.lastUsed = new Date();
    this.proxies.set(this.getProxyId(selected), selected);
    
    return selected;
  }

  async checkProxyHealth(proxy: ProxyConfig): Promise<ProxyHealth> {
    const id = this.getProxyId(proxy);
    const startTime = Date.now();
    
    try {
      // Test proxy connectivity
      const axios = require('axios');
      const response = await axios.get(this.config.testUrl, {
        proxy: {
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol,
          auth: proxy.username && proxy.password ? {
            username: proxy.username,
            password: proxy.password,
          } : undefined,
        },
        timeout: 10000,
      });
      
      const latency = Date.now() - startTime;
      const isAlive = response.status >= 200 && response.status < 400;
      
      const health: ProxyHealth = {
        proxyId: id,
        isAlive,
        latency,
        lastCheck: new Date(),
        failureCount: 0,
        successCount: 1,
        averageLatency: latency,
        uptime: 100,
      };
      
      // Update health status
      const existingHealth = this.healthStatus.get(id);
      if (existingHealth) {
        health.successCount = existingHealth.successCount + 1;
        health.failureCount = existingHealth.failureCount;
        health.averageLatency = (existingHealth.averageLatency * existingHealth.successCount + latency) / 
                                (existingHealth.successCount + 1);
        
        const totalChecks = health.successCount + health.failureCount;
        health.uptime = (health.successCount / totalChecks) * 100;
      }
      
      this.healthStatus.set(id, health);
      proxy.isAlive = true;
      
      return health;
      
    } catch (error) {
      const health: ProxyHealth = {
        proxyId: id,
        isAlive: false,
        latency: Date.now() - startTime,
        lastCheck: new Date(),
        failureCount: 1,
        successCount: 0,
        averageLatency: 0,
        uptime: 0,
      };
      
      const existingHealth = this.healthStatus.get(id);
      if (existingHealth) {
        health.failureCount = existingHealth.failureCount + 1;
        health.successCount = existingHealth.successCount;
        
        const totalChecks = health.successCount + health.failureCount;
        health.uptime = (health.successCount / totalChecks) * 100;
      }
      
      this.healthStatus.set(id, health);
      proxy.isAlive = false;
      
      // Check if proxy should be banned
      if (health.failureCount >= this.config.maxFailures) {
        this.bannedProxies.add(id);
        logger.warn(`Proxy ${id} banned due to repeated failures`);
      }
      
      return health;
    }
  }

  async healthCheckAll(): Promise<void> {
    const proxies = Array.from(this.proxies.values());
    
    for (const proxy of proxies) {
      await this.checkProxyHealth(proxy);
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Ensure minimum proxies
    const aliveProxies = Array.from(this.proxies.values())
      .filter(p => p.isAlive && !this.bannedProxies.has(this.getProxyId(p)));
    
    if (aliveProxies.length < this.config.minProxies) {
      this.emit('low-proxy-count', aliveProxies.length);
      logger.warn(`Low proxy count: ${aliveProxies.length}/${this.config.minProxies}`);
    }
    
    this.emit('health-check-completed', {
      total: proxies.length,
      alive: aliveProxies.length,
      banned: this.bannedProxies.size,
    });
  }

  async startHealthCheck(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    await this.healthCheckAll();
    
    // Schedule regular health checks
    setInterval(async () => {
      await this.healthCheckAll();
    }, this.config.healthCheckInterval);
    
    logger.info('Proxy health check started');
  }

  getProxyStats(): any {
    const total = this.proxies.size;
    const alive = Array.from(this.proxies.values())
      .filter(p => p.isAlive && !this.bannedProxies.has(this.getProxyId(p)))
      .length;
    const banned = this.bannedProxies.size;
    
    const countries = new Set<string>();
    const protocols = new Set<string>();
    
    this.proxies.forEach(p => {
      if (p.country) countries.add(p.country);
      protocols.add(p.protocol);
    });
    
    const healthStats = Array.from(this.healthStatus.values());
    const averageUptime = healthStats.length > 0
      ? healthStats.reduce((sum, h) => sum + h.uptime, 0) / healthStats.length
      : 0;
    
    const averageLatency = healthStats.length > 0
      ? healthStats.reduce((sum, h) => sum + h.averageLatency, 0) / healthStats.length
      : 0;
    
    return {
      total,
      alive,
      banned,
      countries: Array.from(countries),
      protocols: Array.from(protocols),
      averageUptime,
      averageLatency,
    };
  }

  getProxyHealth(id: string): ProxyHealth | null {
    return this.healthStatus.get(id) || null;
  }

  exportProxies(): ProxyConfig[] {
    return Array.from(this.proxies.values());
  }

  importProxies(proxies: ProxyConfig[]): void {
    proxies.forEach(proxy => {
      this.addProxy(proxy);
    });
  }

  getRotatingProxy(): ProxyConfig | null {
    const proxy = this.getProxy();
    if (proxy) {
      // Mark as used for rotation
      const id = this.getProxyId(proxy);
      proxy.lastUsed = new Date();
      this.proxies.set(id, proxy);
    }
    return proxy;
  }

  getProxyForCountry(countryCode: string): ProxyConfig | null {
    const available = Array.from(this.proxies.values())
      .filter(p => p.country === countryCode && 
                   p.isAlive && 
                   !this.bannedProxies.has(this.getProxyId(p)));
    
    if (available.length === 0) return null;
    
    return available[Math.floor(Math.random() * available.length)];
  }

  markProxyBad(id: string): void {
    const proxy = this.proxies.get(id);
    if (proxy) {
      proxy.isAlive = false;
      this.proxies.set(id, proxy);
      
      const health = this.healthStatus.get(id);
      if (health) {
        health.failureCount++;
        health.isAlive = false;
        this.healthStatus.set(id, health);
        
        if (health.failureCount >= this.config.maxFailures) {
          this.bannedProxies.add(id);
        }
      }
    }
  }

  markProxyGood(id: string): void {
    const proxy = this.proxies.get(id);
    if (proxy) {
      proxy.isAlive = true;
      this.proxies.set(id, proxy);
      
      const health = this.healthStatus.get(id);
      if (health) {
        health.isAlive = true;
        health.failureCount = 0;
        this.healthStatus.set(id, health);
      }
      
      this.bannedProxies.delete(id);
    }
  }
}

// Export singleton instance
export const proxyUtils = ProxyUtils.getInstance();