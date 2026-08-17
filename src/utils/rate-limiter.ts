import { logger } from './logger';

interface RateLimiterConfig {
  maxRequests: number;
  timeWindow: number; // in milliseconds
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private config: RateLimiterConfig;
  private requests: Map<string, RateLimitEntry> = new Map();

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  async checkLimit(key: string): Promise<void> {
    const now = Date.now();
    const entry = this.requests.get(key);

    if (!entry) {
      // First request for this key
      this.requests.set(key, {
        count: 1,
        resetTime: now + this.config.timeWindow,
      });
      return;
    }

    // Check if window has expired
    if (now > entry.resetTime) {
      // Reset the window
      this.requests.set(key, {
        count: 1,
        resetTime: now + this.config.timeWindow,
      });
      return;
    }

    // Check if limit exceeded
    if (entry.count >= this.config.maxRequests) {
      const waitTime = entry.resetTime - now;
      logger.warn(`Rate limit exceeded for ${key}, wait ${waitTime}ms`);
      throw new Error(`Rate limit exceeded. Please try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    // Increment counter
    entry.count++;
    this.requests.set(key, entry);
  }

  getRemainingRequests(key: string): number {
    const entry = this.requests.get(key);
    if (!entry) return this.config.maxRequests;
    
    const now = Date.now();
    if (now > entry.resetTime) {
      return this.config.maxRequests;
    }
    
    return Math.max(0, this.config.maxRequests - entry.count);
  }

  getResetTime(key: string): number | null {
    const entry = this.requests.get(key);
    if (!entry) return null;
    return entry.resetTime;
  }

  clear(key: string): void {
    this.requests.delete(key);
  }

  clearAll(): void {
    this.requests.clear();
  }
}

export default RateLimiter;