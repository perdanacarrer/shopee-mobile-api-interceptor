import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface DeviceConfig {
  id: string;
  model: string;
  androidVersion: string;
  screenSize: string;
  ram: number;
  storage: number;
  email: string;
  password: string;
  proxy?: string;
}

export interface DeviceStatus {
  deviceId: string;
  isActive: boolean;
  isBusy: boolean;
  lastUsed: Date;
  health: number;
  currentRequest?: any;
  uptime: number;
  errors: number;
}

export class DeviceFarm extends EventEmitter {
  private devices: Map<string, DeviceConfig> = new Map();
  private statuses: Map<string, DeviceStatus> = new Map();
  private busyDevices: Set<string> = new Set();
  private deviceEmulators: Map<string, any> = new Map();
  private androidHome: string;
  private deviceCount: number = 0;

  constructor(config: { androidHome?: string } = {}) {
    super();
    this.androidHome = config.androidHome || process.env.ANDROID_HOME || '';
    
    if (!this.androidHome) {
      logger.warn('ANDROID_HOME not set, device emulation may not work');
    }
  }

  async provisionDevices(count: number, config?: Partial<DeviceConfig>): Promise<DeviceConfig[]> {
    const devices: DeviceConfig[] = [];

    for (let i = 0; i < count; i++) {
      const device = await this.createDevice({
        ...config,
        id: `device_${Date.now()}_${i}`,
      });
      
      devices.push(device);
      this.devices.set(device.id, device);
      this.deviceCount++;
      
      // Initialize device status
      this.statuses.set(device.id, {
        deviceId: device.id,
        isActive: true,
        isBusy: false,
        lastUsed: new Date(),
        health: 100,
        uptime: 0,
        errors: 0,
      });
    }

    logger.info(`Provisioned ${count} devices`);
    this.emit('devices-provisioned', devices);
    
    return devices;
  }

  private async createDevice(config: Partial<DeviceConfig>): Promise<DeviceConfig> {
    const model = config.model || this.getRandomModel();
    const androidVersion = config.androidVersion || this.getRandomAndroidVersion();
    
    // Generate unique device identifiers
    const deviceId = config.id || uuidv4();
    
    return {
      id: deviceId,
      model,
      androidVersion,
      screenSize: config.screenSize || this.getRandomScreenSize(),
      ram: config.ram || Math.floor(Math.random() * 4) + 4, // 4-8 GB
      storage: config.storage || Math.floor(Math.random() * 4) + 16, // 16-64 GB
      email: config.email || this.generateEmail(deviceId),
      password: config.password || this.generatePassword(),
      proxy: config.proxy,
    };
  }

  private getRandomModel(): string {
    const models = [
      'SM-G998B', 'SM-N986B', 'SM-S908B', 'SM-A536B',
      'Pixel 6', 'Pixel 7', 'Pixel 7 Pro',
      'OnePlus 9', 'OnePlus 10', 'OnePlus 11',
      'Xiaomi 11', 'Xiaomi 12', 'Xiaomi 13',
      'iPhone 13', 'iPhone 14', 'iPhone 15',
      'OPPO Find X5', 'OPPO Find X6',
      'Vivo X80', 'Vivo X90',
      'Realme GT', 'Realme GT 2',
    ];
    return models[Math.floor(Math.random() * models.length)];
  }

  private getRandomAndroidVersion(): string {
    const versions = ['12', '13', '14'];
    return versions[Math.floor(Math.random() * versions.length)];
  }

  private getRandomScreenSize(): string {
    const sizes = ['1080x2400', '1440x3200', '1080x2340', '1242x2688', '828x1792'];
    return sizes[Math.floor(Math.random() * sizes.length)];
  }

  private generateEmail(deviceId: string): string {
    const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'protonmail.com'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `user_${deviceId.substring(0, 8)}@${domain}`;
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

  async startDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    try {
      // Start Android emulator
      await this.startAndroidEmulator(device);
      
      // Update status
      const status = this.statuses.get(deviceId);
      if (status) {
        status.isActive = true;
        status.uptime = 0;
        status.errors = 0;
        status.health = 100;
      }

      logger.info(`Device ${deviceId} started`);
      this.emit('device-started', deviceId);
    } catch (error) {
      logger.error(`Failed to start device ${deviceId}`, { error });
      throw error;
    }
  }

  private async startAndroidEmulator(device: DeviceConfig): Promise<void> {
    // Check if Android SDK is available
    if (!this.androidHome) {
      logger.warn('Android SDK not available, using virtual device');
      // Use virtual device emulation
      this.deviceEmulators.set(device.id, {
        isEmulated: true,
        startTime: Date.now(),
      });
      return;
    }

    // Create AVD if it doesn't exist
    const avdName = `shopee_${device.id.substring(0, 8)}`;
    
    try {
      // Check if AVD exists
      await execAsync(`${this.androidHome}/tools/bin/avdmanager list avd`);
      
      // Create AVD if needed
      await execAsync(
        `${this.androidHome}/tools/bin/avdmanager create avd ` +
        `-n ${avdName} -k "system-images;android-${device.androidVersion};google_apis;x86_64"`
      );
      
      // Start emulator
      const emulatorProcess = exec(
        `${this.androidHome}/emulator/emulator -avd ${avdName} -no-audio -no-window`
      );
      
      this.deviceEmulators.set(device.id, {
        process: emulatorProcess,
        avdName,
        startTime: Date.now(),
      });
      
      // Wait for emulator to boot
      await this.waitForEmulator(device.id);
      
    } catch (error) {
      logger.error(`Failed to start Android emulator for device ${device.id}`, { error });
      // Fallback to virtual device
      this.deviceEmulators.set(device.id, {
        isEmulated: true,
        startTime: Date.now(),
        error: error,
      });
    }
  }

  private async waitForEmulator(deviceId: string, timeout: number = 120000): Promise<void> {
    const startTime = Date.now();
    const emulator = this.deviceEmulators.get(deviceId);
    
    if (!emulator) {
      throw new Error(`Emulator for device ${deviceId} not found`);
    }

    while (Date.now() - startTime < timeout) {
      try {
        const { stdout } = await execAsync(
          `${this.androidHome}/platform-tools/adb devices`
        );
        
        if (stdout.includes(emulator.avdName)) {
          // Device is ready
          await new Promise(resolve => setTimeout(resolve, 5000)); // Additional wait
          return;
        }
      } catch (error) {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Emulator boot timeout for device ${deviceId}`);
  }

  async stopDevice(deviceId: string): Promise<void> {
    const emulator = this.deviceEmulators.get(deviceId);
    
    if (emulator && emulator.process) {
      emulator.process.kill();
      this.deviceEmulators.delete(deviceId);
      
      // Update status
      const status = this.statuses.get(deviceId);
      if (status) {
        status.isActive = false;
        status.isBusy = false;
      }
      
      logger.info(`Device ${deviceId} stopped`);
      this.emit('device-stopped', deviceId);
    }
  }

  getAvailableDevice(): DeviceConfig | null {
    for (const [deviceId, status] of this.statuses) {
      if (status.isActive && !status.isBusy && status.health > 50) {
        const device = this.devices.get(deviceId);
        if (device) {
          return device;
        }
      }
    }
    return null;
  }

  getDeviceStatus(deviceId: string): DeviceStatus | null {
    return this.statuses.get(deviceId) || null;
  }

  getAllDeviceStatuses(): DeviceStatus[] {
    return Array.from(this.statuses.values());
  }

  markDeviceBusy(deviceId: string, requestId: string): void {
    const status = this.statuses.get(deviceId);
    if (status) {
      status.isBusy = true;
      status.currentRequest = requestId;
      status.lastUsed = new Date();
    }
    this.busyDevices.add(deviceId);
  }

  markDeviceAvailable(deviceId: string): void {
    const status = this.statuses.get(deviceId);
    if (status) {
      status.isBusy = false;
      status.currentRequest = undefined;
    }
    this.busyDevices.delete(deviceId);
  }

  updateDeviceHealth(deviceId: string, healthChange: number): void {
    const status = this.statuses.get(deviceId);
    if (status) {
      status.health = Math.max(0, Math.min(100, status.health + healthChange));
      
      if (status.health < 20) {
        this.emit('device-health-critical', deviceId);
        logger.warn(`Device ${deviceId} health critical: ${status.health}%`);
      }
    }
  }

  async monitorDevices(): Promise<void> {
    setInterval(async () => {
      for (const [deviceId, status] of this.statuses) {
        if (status.isActive) {
          status.uptime++;
          
          // Check health
          if (status.isBusy && status.uptime % 60 === 0) {
            // Check if device is still responsive
            try {
              await this.pingDevice(deviceId);
            } catch (error) {
              status.errors++;
              status.health -= 5;
              
              if (status.errors > 10) {
                await this.restartDevice(deviceId);
              }
            }
          }
        }
      }
    }, 1000);
  }

  private async pingDevice(deviceId: string): Promise<void> {
    // Implement device health check
    // This could be an ADB command or API call
    return new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  private async restartDevice(deviceId: string): Promise<void> {
    logger.info(`Restarting device ${deviceId}`);
    await this.stopDevice(deviceId);
    await new Promise(resolve => setTimeout(resolve, 5000));
    await this.startDevice(deviceId);
    
    // Reset status
    const status = this.statuses.get(deviceId);
    if (status) {
      status.health = 100;
      status.errors = 0;
    }
  }

  getDeviceCount(): number {
    return this.deviceCount;
  }

  getActiveDeviceCount(): number {
    return Array.from(this.statuses.values())
      .filter(s => s.isActive && s.health > 50)
      .length;
  }

  getBusyDeviceCount(): number {
    return this.busyDevices.size;
  }

  async destroy(): Promise<void> {
    // Stop all devices
    for (const [deviceId] of this.devices) {
      await this.stopDevice(deviceId);
    }
    
    this.devices.clear();
    this.statuses.clear();
    this.busyDevices.clear();
    this.deviceEmulators.clear();
    
    logger.info('Device farm destroyed');
  }
}