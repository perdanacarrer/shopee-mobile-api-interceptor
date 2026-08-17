#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { DeviceFarm } from '../src/mobile/scaling/device-farm';
import { SessionPool } from '../src/mobile/scaling/session-pool';
import { LoadBalancer } from '../src/mobile/scaling/load-balancer';
import { logger } from '../src/utils/logger';

const execAsync = promisify(exec);

interface DeviceFarmDeployConfig {
  deviceCount?: number;
  deviceModel?: string;
  androidVersion?: string;
  useEmulators?: boolean;
  useDocker?: boolean;
  enableScaling?: boolean;
  maxConcurrentRequests?: number;
  outputDir?: string;
  verbose?: boolean;
}

class DeviceFarmDeployer {
  private config: DeviceFarmDeployConfig;
  private deviceFarm: DeviceFarm;
  private sessionPool: SessionPool;
  private loadBalancer: LoadBalancer;
  private deployedDevices: Map<string, any> = new Map();

  constructor(config: DeviceFarmDeployConfig = {}) {
    this.config = {
      deviceCount: 5,
      androidVersion: '12',
      useEmulators: true,
      useDocker: true,
      enableScaling: true,
      maxConcurrentRequests: 10,
      outputDir: './device-farm-data',
      verbose: false,
      ...config,
    };

    this.setupDirectories();
    this.initializeComponents();
  }

  private setupDirectories(): void {
    const dirs = [
      this.config.outputDir!,
      path.join(this.config.outputDir!, 'devices'),
      path.join(this.config.outputDir!, 'logs'),
      path.join(this.config.outputDir!, 'data'),
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  private initializeComponents(): void {
    // Initialize device farm
    this.deviceFarm = new DeviceFarm({
      androidHome: process.env.ANDROID_HOME,
    });

    // Initialize session pool
    this.sessionPool = new SessionPool({
      maxSessions: this.config.deviceCount! * 2,
      tokenRefreshThreshold: 300,
      maxSessionAge: 86400,
      maxUsesPerSession: 1000,
    });

    // Initialize load balancer
    this.loadBalancer = new LoadBalancer(
      this.deviceFarm,
      this.sessionPool,
      {
        strategy: 'least-busy',
        maxConcurrentRequests: this.config.maxConcurrentRequests!,
        healthCheckInterval: 30000,
        retryCount: 3,
        retryDelay: 1000,
        circuitBreakerThreshold: 5,
      }
    );

    // Setup event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.deviceFarm.on('device-started', (deviceId) => {
      console.log(`✅ Device started: ${deviceId}`);
    });

    this.deviceFarm.on('device-stopped', (deviceId) => {
      console.log(`🛑 Device stopped: ${deviceId}`);
    });

    this.deviceFarm.on('device-health-critical', (deviceId) => {
      console.warn(`⚠️ Device health critical: ${deviceId}`);
    });

    this.sessionPool.on('session-created', (session) => {
      console.log(`🔑 Session created: ${session.id}`);
    });

    this.sessionPool.on('session-refreshed', (session) => {
      console.log(`🔄 Session refreshed: ${session.id}`);
    });

    this.loadBalancer.on('request-completed', (assignedRequest, result) => {
      if (this.config.verbose) {
        console.log(`✅ Request completed: ${assignedRequest.request.id}`);
      }
    });

    this.loadBalancer.on('request-failed', (assignedRequest, error) => {
      console.error(`❌ Request failed: ${assignedRequest.request.id}`, error);
    });

    this.loadBalancer.on('circuit-breaker-open', (deviceId) => {
      console.warn(`🔌 Circuit breaker opened for device: ${deviceId}`);
    });
  }

  async deploy(): Promise<void> {
    console.log('🚀 Deploying device farm...');
    console.log(`📱 Device count: ${this.config.deviceCount}`);
    console.log(`📱 Android version: ${this.config.androidVersion}`);

    try {
      // Check prerequisites
      await this.checkPrerequisites();

      // Deploy devices
      await this.deployDevices();

      // Start devices
      await this.startDevices();

      // Initialize sessions
      await this.initializeSessions();

      // Start load balancer
      await this.startLoadBalancer();

      // Start monitoring
      await this.startMonitoring();

      // Save deployment info
      await this.saveDeploymentInfo();

      console.log('✅ Device farm deployed successfully!');
      
    } catch (error) {
      console.error('❌ Deployment failed:', error);
      await this.cleanup();
      throw error;
    }
  }

  private async checkPrerequisites(): Promise<void> {
    console.log('📋 Checking prerequisites...');

    // Check Docker
    if (this.config.useDocker) {
      try {
        await execAsync('docker --version');
        console.log('✅ Docker found');
      } catch (error) {
        console.warn('⚠️ Docker not found, falling back to local emulation');
        this.config.useDocker = false;
      }
    }

    // Check Android SDK
    if (this.config.useEmulators) {
      if (!process.env.ANDROID_HOME) {
        console.warn('⚠️ ANDROID_HOME not set, emulation may not work');
      } else {
        console.log('✅ Android SDK found');
      }
    }

    // Check Node.js
    console.log(`✅ Node.js ${process.version}`);
  }

  private async deployDevices(): Promise<void> {
    console.log('📱 Deploying devices...');

    const deviceConfigs = [];
    const models = this.getDeviceModels();

    for (let i = 0; i < this.config.deviceCount!; i++) {
      const model = this.config.deviceModel || models[i % models.length];
      const androidVersion = this.config.androidVersion!;
      
      const deviceConfig = {
        id: `device_${Date.now()}_${i}`,
        model,
        androidVersion,
        screenSize: this.getRandomScreenSize(),
        ram: this.getRandomRAM(),
        storage: this.getRandomStorage(),
        email: `user_${i + 1}@example.com`,
        password: this.generatePassword(),
      };

      deviceConfigs.push(deviceConfig);
      this.deployedDevices.set(deviceConfig.id, deviceConfig);
    }

    // Provision devices
    await this.deviceFarm.provisionDevices(this.config.deviceCount!, {
      model: this.config.deviceModel,
      androidVersion: this.config.androidVersion,
    });

    console.log(`✅ Deployed ${deviceConfigs.length} devices`);
  }

  private getDeviceModels(): string[] {
    return [
      'SM-G998B', 'SM-N986B', 'SM-S908B', 'SM-A536B',
      'Pixel 6', 'Pixel 7', 'Pixel 7 Pro',
      'OnePlus 9', 'OnePlus 10', 'OnePlus 11',
      'Xiaomi 11', 'Xiaomi 12', 'Xiaomi 13',
    ];
  }

  private getRandomScreenSize(): string {
    const sizes = ['1080x2400', '1440x3200', '1080x2340', '1242x2688', '828x1792'];
    return sizes[Math.floor(Math.random() * sizes.length)];
  }

  private getRandomRAM(): number {
    return [4, 6, 8, 12, 16][Math.floor(Math.random() * 5)];
  }

  private getRandomStorage(): number {
    return [32, 64, 128, 256, 512][Math.floor(Math.random() * 5)];
  }

  private generatePassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }

  private async startDevices(): Promise<void> {
    console.log('▶️ Starting devices...');

    const devices = this.deviceFarm.getAllDeviceStatuses();
    for (const status of devices) {
      await this.deviceFarm.startDevice(status.deviceId);
      // Stagger startup
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`✅ Started ${devices.length} devices`);
  }

  private async initializeSessions(): Promise<void> {
    console.log('🔑 Initializing sessions...');

    const devices = this.deviceFarm.getAllDeviceStatuses();
    for (const status of devices) {
      const device = this.deployedDevices.get(status.deviceId);
      if (device) {
        try {
          // Simulate token generation
          const tokens = {
            accessToken: this.generateToken(),
            refreshToken: this.generateToken(),
            expiresIn: 86400,
          };

          await this.sessionPool.createSession(device, tokens);
          console.log(`✅ Session initialized for device ${status.deviceId}`);
        } catch (error) {
          console.error(`❌ Failed to initialize session for device ${status.deviceId}`, error);
        }
      }
    }

    console.log(`✅ Initialized sessions for ${devices.length} devices`);
  }

  private generateToken(): string {
    return Buffer.from(Math.random().toString(36) + Date.now().toString(36))
      .toString('base64')
      .substring(0, 64);
  }

  private async startLoadBalancer(): Promise<void> {
    console.log('⚖️ Starting load balancer...');

    // Start auto-refresh for sessions
    await this.sessionPool.startAutoRefresh();

    console.log('✅ Load balancer started');
  }

  private async startMonitoring(): Promise<void> {
    console.log('📊 Starting monitoring...');

    // Start device monitoring
    await this.deviceFarm.monitorDevices();

    // Periodic status updates
    setInterval(() => {
      const stats = this.loadBalancer.getStats();
      if (this.config.verbose) {
        console.log('\n📊 Load Balancer Stats:');
        console.log(`  Active Requests: ${stats.activeRequests}`);
        console.log(`  Queue Length: ${stats.queueLength}`);
        console.log(`  Completed: ${stats.completedRequests}`);
        console.log(`  Failed: ${stats.failedRequests}`);
      }
    }, 30000);

    console.log('✅ Monitoring started');
  }

  private async saveDeploymentInfo(): Promise<void> {
    const info = {
      deploymentId: `deploy_${Date.now()}`,
      timestamp: new Date().toISOString(),
      config: this.config,
      devices: Array.from(this.deployedDevices.values()),
      stats: {
        totalDevices: this.deviceFarm.getDeviceCount(),
        activeDevices: this.deviceFarm.getActiveDeviceCount(),
        sessions: this.sessionPool.getSessionStats(),
      },
    };

    const filePath = path.join(this.config.outputDir!, 'deployment-info.json');
    fs.writeFileSync(filePath, JSON.stringify(info, null, 2));
    console.log(`📄 Deployment info saved: ${filePath}`);
  }

  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up...');

    try {
      await this.loadBalancer.destroy();
      await this.sessionPool.destroy();
      await this.deviceFarm.destroy();
      
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
    }
  }

  async scaleUp(additionalDevices: number): Promise<void> {
    console.log(`📈 Scaling up by ${additionalDevices} devices...`);

    const newDevices = await this.deviceFarm.provisionDevices(additionalDevices);
    
    for (const device of newDevices) {
      await this.deviceFarm.startDevice(device.id);
      
      const tokens = {
        accessToken: this.generateToken(),
        refreshToken: this.generateToken(),
        expiresIn: 86400,
      };
      
      await this.sessionPool.createSession(device, tokens);
    }

    console.log(`✅ Scaled up to ${this.deviceFarm.getDeviceCount()} devices`);
  }

  async scaleDown(devicesToRemove: number): Promise<void> {
    console.log(`📉 Scaling down by ${devicesToRemove} devices...`);

    const devices = this.deviceFarm.getAllDeviceStatuses();
    const toRemove = devices.slice(0, devicesToRemove);

    for (const status of toRemove) {
      await this.deviceFarm.stopDevice(status.deviceId);
    }

    console.log(`✅ Scaled down to ${this.deviceFarm.getDeviceCount()} devices`);
  }

  async getStatus(): Promise<any> {
    return {
      devices: {
        total: this.deviceFarm.getDeviceCount(),
        active: this.deviceFarm.getActiveDeviceCount(),
        busy: this.deviceFarm.getBusyDeviceCount(),
      },
      sessions: this.sessionPool.getSessionStats(),
      loadBalancer: this.loadBalancer.getStats(),
    };
  }
}

// CLI Entry Point
if (require.main === module) {
  const args = process.argv.slice(2);
  const config: DeviceFarmDeployConfig = {};
  let command = 'deploy';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case 'deploy':
      case 'scale-up':
      case 'scale-down':
      case 'status':
      case 'cleanup':
        command = args[i];
        break;
      case '--count':
      case '-c':
        config.deviceCount = parseInt(args[++i]);
        break;
      case '--model':
      case '-m':
        config.deviceModel = args[++i];
        break;
      case '--android':
      case '-a':
        config.androidVersion = args[++i];
        break;
      case '--max-requests':
        config.maxConcurrentRequests = parseInt(args[++i]);
        break;
      case '--output':
      case '-o':
        config.outputDir = args[++i];
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: npm run deploy-device-farm [command] [options]

Commands:
  deploy      Deploy the device farm (default)
  scale-up    Scale up the device farm
  scale-down  Scale down the device farm
  status      Show device farm status
  cleanup     Cleanup device farm

Options:
  -c, --count <number>      Number of devices to deploy
  -m, --model <model>       Device model to use
  -a, --android <version>   Android version (default: 12)
  --max-requests <number>   Max concurrent requests (default: 10)
  -o, --output <dir>        Output directory (default: ./device-farm-data)
  -v, --verbose             Enable verbose logging
  -h, --help                Show this help message

Examples:
  npm run deploy-device-farm -- deploy -c 5
  npm run deploy-device-farm -- scale-up -c 3
  npm run deploy-device-farm -- status
        `);
        process.exit(0);
        break;
    }
  }

  const deployer = new DeviceFarmDeployer(config);

  // Execute command
  switch (command) {
    case 'deploy':
      deployer.deploy()
        .then(() => {
          console.log('\n🎉 Device farm deployment completed!');
        })
        .catch((error) => {
          console.error('❌ Deployment failed:', error);
          process.exit(1);
        });
      break;

    case 'scale-up':
      const scaleUpCount = config.deviceCount || 3;
      deployer.deploy()
        .then(() => deployer.scaleUp(scaleUpCount))
        .then(() => {
          console.log(`✅ Scaled up by ${scaleUpCount} devices`);
        })
        .catch((error) => {
          console.error('❌ Scale up failed:', error);
          process.exit(1);
        });
      break;

    case 'scale-down':
      const scaleDownCount = config.deviceCount || 2;
      deployer.deploy()
        .then(() => deployer.scaleDown(scaleDownCount))
        .then(() => {
          console.log(`✅ Scaled down by ${scaleDownCount} devices`);
        })
        .catch((error) => {
          console.error('❌ Scale down failed:', error);
          process.exit(1);
        });
      break;

    case 'status':
      deployer.deploy()
        .then(() => deployer.getStatus())
        .then((status) => {
          console.log('\n📊 Device Farm Status:');
          console.log(JSON.stringify(status, null, 2));
        })
        .catch((error) => {
          console.error('❌ Failed to get status:', error);
          process.exit(1);
        });
      break;

    case 'cleanup':
      deployer.deploy()
        .then(() => deployer.cleanup())
        .then(() => {
          console.log('✅ Cleanup completed');
        })
        .catch((error) => {
          console.error('❌ Cleanup failed:', error);
          process.exit(1);
        });
      break;

    default:
      console.log(`Unknown command: ${command}`);
      console.log('Run with --help for usage information');
      process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Interrupt received, cleaning up...');
    await deployer.cleanup();
    process.exit(0);
  });
}

export { DeviceFarmDeployer };