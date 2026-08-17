import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { DeviceFarm, DeviceConfig } from './device-farm';
import { SessionPool, Session } from './session-pool';

export interface LoadBalancerConfig {
  strategy: 'round-robin' | 'least-busy' | 'random' | 'weighted';
  maxConcurrentRequests: number;
  healthCheckInterval: number;
  retryCount: number;
  retryDelay: number;
  circuitBreakerThreshold: number;
}

export interface Request {
  id: string;
  type: string;
  params: any;
  priority: 'low' | 'medium' | 'high';
  timestamp: Date;
  retries: number;
}

export interface AssignedRequest {
  request: Request;
  deviceId: string;
  sessionId: string;
  assignedAt: Date;
}

export class LoadBalancer extends EventEmitter {
  private config: LoadBalancerConfig;
  private deviceFarm: DeviceFarm;
  private sessionPool: SessionPool;
  private queue: Request[] = [];
  private activeRequests: Map<string, AssignedRequest> = new Map();
  private completedRequests: Map<string, any> = new Map();
  private failedRequests: Map<string, any> = new Map();
  private deviceStats: Map<string, {
    totalRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    lastFailure: Date | null;
  }> = new Map();
  private isRunning: boolean = false;
  private circuitBreaker: Map<string, boolean> = new Map();

  constructor(
    deviceFarm: DeviceFarm,
    sessionPool: SessionPool,
    config: Partial<LoadBalancerConfig> = {}
  ) {
    super();
    
    this.deviceFarm = deviceFarm;
    this.sessionPool = sessionPool;
    
    this.config = {
      strategy: 'least-busy',
      maxConcurrentRequests: 10,
      healthCheckInterval: 30000,
      retryCount: 3,
      retryDelay: 1000,
      circuitBreakerThreshold: 5,
      ...config,
    };
  }

  async submitRequest(request: Request): Promise<any> {
    return new Promise((resolve, reject) => {
      // Add to queue
      this.queue.push({
        ...request,
        timestamp: new Date(),
        retries: 0,
      });
      
      // Sort queue by priority
      this.sortQueue();
      
      // Process queue
      this.processQueue();
      
      // Set up listener for completion
      const listener = (assignedRequest: AssignedRequest, result: any) => {
        if (assignedRequest.request.id === request.id) {
          this.off('request-completed', listener);
          this.off('request-failed', listener);
          resolve(result);
        }
      };
      
      const failureListener = (assignedRequest: AssignedRequest, error: any) => {
        if (assignedRequest.request.id === request.id) {
          this.off('request-completed', listener);
          this.off('request-failed', failureListener);
          reject(error);
        }
      };
      
      this.on('request-completed', listener);
      this.on('request-failed', failureListener);
    });
  }

  private sortQueue(): void {
    const priorityWeight = {
      high: 3,
      medium: 2,
      low: 1,
    };
    
    this.queue.sort((a, b) => {
      const weightA = priorityWeight[a.priority] || 0;
      const weightB = priorityWeight[b.priority] || 0;
      return weightB - weightA;
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isRunning) return;
    if (this.queue.length === 0) return;
    
    this.isRunning = true;
    
    try {
      while (this.queue.length > 0 && this.activeRequests.size < this.config.maxConcurrentRequests) {
        const request = this.queue.shift();
        if (!request) break;
        
        // Check circuit breaker
        if (this.isCircuitBreakerOpen()) {
          logger.warn('Circuit breaker open, delaying requests');
          break;
        }
        
        await this.assignRequest(request);
      }
    } catch (error) {
      logger.error('Error processing queue', { error });
    } finally {
      this.isRunning = false;
    }
  }

  private async assignRequest(request: Request): Promise<void> {
    try {
      // Select device based on strategy
      const device = this.selectDevice();
      if (!device) {
        // Re-queue if no device available
        this.queue.unshift(request);
        return;
      }
      
      // Get session for device
      const session = await this.getSessionForDevice(device.id);
      if (!session) {
        // Re-queue if no session available
        this.queue.unshift(request);
        return;
      }
      
      // Mark device as busy
      this.deviceFarm.markDeviceBusy(device.id, request.id);
      
      const assignedRequest: AssignedRequest = {
        request,
        deviceId: device.id,
        sessionId: session.id,
        assignedAt: new Date(),
      };
      
      this.activeRequests.set(request.id, assignedRequest);
      
      // Update stats
      this.updateDeviceStats(device.id, true);
      
      // Execute request
      this.executeRequest(assignedRequest);
      
    } catch (error) {
      logger.error('Failed to assign request', { error, requestId: request.id });
      // Re-queue on failure
      this.queue.unshift(request);
    }
  }

  private selectDevice(): DeviceConfig | null {
    const devices = this.deviceFarm.getAvailableDevice();
    
    if (!devices) {
      return null;
    }
    
    // If multiple devices, apply strategy
    const availableDevices = this.deviceFarm.getAvailableDevice();
    if (!availableDevices) return null;
    
    // For simplicity, return the first available
    // In production, implement strategy selection
    return availableDevices;
  }

  private async getSessionForDevice(deviceId: string): Promise<Session | null> {
    // Get active sessions for device
    const sessions = this.sessionPool.getActiveSessions();
    const deviceSessions = sessions.filter(s => s.deviceId === deviceId);
    
    if (deviceSessions.length === 0) {
      // Create new session for device
      // This would involve getting tokens from the device
      return null;
    }
    
    // Return the session with least usage
    return deviceSessions.sort((a, b) => a.useCount - b.useCount)[0];
  }

  private async executeRequest(assignedRequest: AssignedRequest): Promise<void> {
    try {
      const { request, deviceId, sessionId } = assignedRequest;
      
      // In production, this would make the actual API call
      // For now, simulate request execution
      const result = await this.makeApiCall(request, deviceId, sessionId);
      
      // Mark as completed
      this.completedRequests.set(request.id, result);
      this.activeRequests.delete(request.id);
      
      // Update device stats
      this.updateDeviceStats(deviceId, false);
      
      // Mark device as available
      this.deviceFarm.markDeviceAvailable(deviceId);
      
      // Emit completion event
      this.emit('request-completed', assignedRequest, result);
      
      // Process next request
      this.processQueue();
      
    } catch (error) {
      logger.error('Request execution failed', { error, requestId: assignedRequest.request.id });
      
      // Handle failure
      await this.handleRequestFailure(assignedRequest, error);
    }
  }

  private async makeApiCall(request: Request, deviceId: string, sessionId: string): Promise<any> {
    // Simulate API call with potential failures
    return new Promise((resolve, reject) => {
      const timeout = Math.random() * 3000 + 1000;
      
      setTimeout(() => {
        // Simulate success/failure
        if (Math.random() < 0.15) {
          reject(new Error('API call failed'));
        } else {
          resolve({
            success: true,
            data: {
              requestId: request.id,
              deviceId,
              sessionId,
              timestamp: new Date(),
              result: `Processed ${request.type} request with params: ${JSON.stringify(request.params)}`,
            },
          });
        }
      }, timeout);
    });
  }

  private async handleRequestFailure(assignedRequest: AssignedRequest, error: any): Promise<void> {
    const { request, deviceId } = assignedRequest;
    
    // Increment retry count
    request.retries++;
    
    // Update stats
    this.updateDeviceStats(deviceId, false, true);
    
    // Mark device as available
    this.deviceFarm.markDeviceAvailable(deviceId);
    
    // Check if should retry
    if (request.retries < this.config.retryCount) {
      logger.info(`Retrying request ${request.id}, attempt ${request.retries}`);
      
      // Add back to queue with delay
      setTimeout(() => {
        this.queue.unshift(request);
        this.processQueue();
      }, this.config.retryDelay * request.retries);
      
      this.activeRequests.delete(request.id);
      
    } else {
      // Max retries exceeded
      logger.error(`Request ${request.id} failed after ${request.retries} retries`);
      
      this.failedRequests.set(request.id, { request, error });
      this.activeRequests.delete(request.id);
      
      // Update circuit breaker
      this.updateCircuitBreaker(deviceId, true);
      
      this.emit('request-failed', assignedRequest, error);
    }
  }

  private updateDeviceStats(deviceId: string, isRequest: boolean, isFailure: boolean = false): void {
    let stats = this.deviceStats.get(deviceId);
    
    if (!stats) {
      stats = {
        totalRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        lastFailure: null,
      };
      this.deviceStats.set(deviceId, stats);
    }
    
    if (isRequest) {
      stats.totalRequests++;
    }
    
    if (isFailure) {
      stats.failedRequests++;
      stats.lastFailure = new Date();
    }
  }

  private updateCircuitBreaker(deviceId: string, isFailure: boolean): void {
    const stats = this.deviceStats.get(deviceId);
    if (!stats) return;
    
    const failureRate = stats.totalRequests > 0 
      ? (stats.failedRequests / stats.totalRequests) * 100 
      : 0;
    
    if (failureRate > this.config.circuitBreakerThreshold) {
      this.circuitBreaker.set(deviceId, true);
      logger.warn(`Circuit breaker open for device ${deviceId}`);
      this.emit('circuit-breaker-open', deviceId);
    } else {
      this.circuitBreaker.set(deviceId, false);
      this.emit('circuit-breaker-close', deviceId);
    }
  }

  private isCircuitBreakerOpen(): boolean {
    // Check if any device has open circuit breaker
    for (const [deviceId, isOpen] of this.circuitBreaker) {
      if (isOpen) {
        // Check if timeout has expired
        const stats = this.deviceStats.get(deviceId);
        if (stats?.lastFailure) {
          const timeSinceFailure = Date.now() - stats.lastFailure.getTime();
          if (timeSinceFailure > 60000) { // 1 minute timeout
            this.circuitBreaker.set(deviceId, false);
            continue;
          }
        }
        return true;
      }
    }
    return false;
  }

  getStats(): any {
    return {
      activeRequests: this.activeRequests.size,
      queueLength: this.queue.length,
      completedRequests: this.completedRequests.size,
      failedRequests: this.failedRequests.size,
      deviceStats: Array.from(this.deviceStats.entries()).map(([deviceId, stats]) => ({
        deviceId,
        ...stats,
        failureRate: stats.totalRequests > 0 
          ? (stats.failedRequests / stats.totalRequests) * 100 
          : 0,
      })),
      circuitBreakers: Array.from(this.circuitBreaker.entries())
        .filter(([, isOpen]) => isOpen)
        .map(([deviceId]) => deviceId),
    };
  }

  async clear(): Promise<void> {
    this.queue = [];
    this.activeRequests.clear();
    this.completedRequests.clear();
    this.failedRequests.clear();
    this.deviceStats.clear();
    this.circuitBreaker.clear();
  }

  async destroy(): Promise<void> {
    await this.clear();
    logger.info('Load balancer destroyed');
  }
}