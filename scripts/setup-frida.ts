#!/usr/bin/env node

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import * as https from 'https';
import * as http from 'http';

const execAsync = promisify(exec);

interface FridaSetupConfig {
  deviceId?: string;
  fridaVersion?: string;
  autoStart?: boolean;
  adbPath?: string;
  skipADBCheck?: boolean;
}

class FridaSetup {
  private config: FridaSetupConfig;
  private adbPath: string;
  private fridaServerPath: string;
  private tempDir: string;

  constructor(config: FridaSetupConfig = {}) {
    this.config = {
      fridaVersion: '16.1.0',
      autoStart: true,
      skipADBCheck: false,
      ...config,
    };

    this.adbPath = config.adbPath || this.detectAdbPath();
    this.tempDir = path.join(os.tmpdir(), 'frida-setup');
    this.fridaServerPath = path.join(this.tempDir, 'frida-server');

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private detectAdbPath(): string {
    const androidHome = process.env.ANDROID_HOME;
    if (androidHome) {
      return path.join(androidHome, 'platform-tools', 'adb');
    }
    try {
      execSync('which adb', { stdio: 'pipe' });
      return 'adb';
    } catch (error) {
      return 'adb';
    }
  }

  async setup(): Promise<void> {
    console.log('🚀 Starting Frida setup...');
    
    try {
      await this.checkPrerequisites();
      
      const deviceId = await this.getOrStartDevice();
      
      if (!deviceId) {
        console.log('\n⚠️ No device available. You can:');
        console.log('1. Connect a physical Android device with USB debugging enabled');
        console.log('2. Start an Android emulator from Android Studio');
        console.log('3. Use a cloud device service');
        console.log('\nFor now, continuing without device...');
        return;
      }
      
      console.log(`✅ Using device: ${deviceId}`);
      
      await this.downloadFridaServer();
      await this.pushFridaServer(deviceId);
      await this.installFridaOnDevice(deviceId);
      
      if (this.config.autoStart) {
        await this.startFridaServer(deviceId);
      }
      
      await this.verifyFridaInstallation(deviceId);
      
      console.log('✅ Frida setup completed successfully!');
      
    } catch (error) {
      console.error('❌ Frida setup failed:', error);
      throw error;
    }
  }

  private async checkPrerequisites(): Promise<void> {
    console.log('📋 Checking prerequisites...');

    try {
      await execAsync(`${this.adbPath} version`);
      console.log('✅ ADB found');
    } catch (error) {
      throw new Error('ADB not found. Please install Android SDK and add ADB to PATH');
    }

    console.log(`✅ Node.js ${process.version} found`);
  }

  private async getOrStartDevice(): Promise<string | null> {
    console.log('📱 Detecting connected devices...');
    
    try {
      const { stdout } = await execAsync(`${this.adbPath} devices`);
      const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('List of devices'));
      
      if (lines.length > 0) {
        const availableDevices = lines.filter(line => line.includes('device'));
        if (availableDevices.length > 0) {
          const deviceId = availableDevices[0].split('\t')[0];
          return deviceId;
        }
      }

      console.log('No devices found. Checking for Android emulator...');
      
      try {
        const { stdout: emulatorCheck } = await execAsync('emulator -list-avds 2>/dev/null || echo ""');
        const avds = emulatorCheck.trim().split('\n').filter(line => line.trim());
        
        if (avds.length > 0) {
          console.log('📱 Found Android Virtual Devices:');
          avds.forEach((avd, index) => {
            console.log(`  ${index + 1}. ${avd}`);
          });
          
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          
          const avdChoice = await new Promise<string>((resolve) => {
            rl.question('Select AVD to start (number): ', (answer) => {
              rl.close();
              const index = parseInt(answer) - 1;
              if (index >= 0 && index < avds.length) {
                resolve(avds[index]);
              } else {
                console.log('Invalid selection, using first AVD');
                resolve(avds[0]);
              }
            });
          });
          
          console.log(`🚀 Starting emulator: ${avdChoice}`);
          exec(`emulator -avd ${avdChoice} -no-audio -no-snapshot > /dev/null 2>&1 &`);
          
          console.log('⏳ Waiting for emulator to boot...');
          const deviceId = await this.waitForEmulator();
          return deviceId;
        }
      } catch (error) {
        console.log('⚠️ Android emulator not found or not installed');
      }

      return null;
    } catch (error) {
      console.error('Error detecting devices:', error);
      return null;
    }
  }

  private async waitForEmulator(timeout: number = 120000): Promise<string> {
    const startTime = Date.now();
    const checkInterval = 2000;
    
    while (Date.now() - startTime < timeout) {
      try {
        const { stdout } = await execAsync(`${this.adbPath} devices`);
        const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('List of devices'));
        const device = lines.find(line => line.includes('device') && line.includes('emulator'));
        
        if (device) {
          const deviceId = device.split('\t')[0];
          try {
            const { stdout: bootCheck } = await execAsync(
              `${this.adbPath} -s ${deviceId} shell getprop sys.boot_completed`
            );
            if (bootCheck.trim() === '1') {
              console.log('✅ Emulator booted successfully');
              return deviceId;
            }
          } catch (error) {
            // Device not ready yet
          }
        }
      } catch (error) {
        // Ignore errors during wait
      }
      
      process.stdout.write('.');
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    throw new Error('Timeout waiting for emulator to boot');
  }

  private async downloadFridaServer(): Promise<void> {
    console.log('📥 Downloading Frida server...');

    const version = this.config.fridaVersion || '16.1.0';
    const arch = await this.detectDeviceArch();
    
    const archMap: Record<string, string> = {
      'arm64': 'arm64',
      'arm': 'arm',
      'x86_64': 'x86_64',
      'x86': 'x86',
    };

    const fridaArch = archMap[arch] || 'arm64';
    const fileName = `frida-server-${version}-android-${fridaArch}`;
    const downloadUrl = `https://github.com/frida/frida/releases/download/${version}/${fileName}.xz`;

    console.log(`📥 Downloading ${fileName}...`);

    return new Promise<void>((resolve, reject) => {
      const filePath = path.join(this.tempDir, `${fileName}.xz`);
      const file = fs.createWriteStream(filePath);
      
      const downloadFile = (url: string) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              console.log(`🔄 Following redirect to: ${redirectUrl}`);
              downloadFile(redirectUrl);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download Frida server: ${response.statusCode}`));
            return;
          }

          const totalSize = parseInt(response.headers['content-length'] || '0');
          let downloadedSize = 0;

          response.pipe(file);

          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            if (totalSize > 0) {
              const progress = (downloadedSize / totalSize * 100).toFixed(1);
              process.stdout.write(`\r📥 Downloading: ${progress}%`);
            }
          });

          file.on('finish', () => {
            console.log('\n✅ Frida server downloaded');
            
            try {
              const xzPath = filePath;
              const binaryPath = path.join(this.tempDir, fileName);
              
              try {
                execSync(`xz -d "${xzPath}"`);
                fs.renameSync(binaryPath, this.fridaServerPath);
                fs.chmodSync(this.fridaServerPath, 0o755);
                console.log('✅ Frida server extracted');
                resolve();
              } catch (error) {
                console.warn('⚠️ xz not available, attempting alternative...');
                this.downloadFridaServerAlternative(version, fridaArch, resolve, reject);
              }
            } catch (error) {
              reject(new Error(`Failed to extract Frida server: ${error}`));
            }
          });

          file.on('error', (error) => {
            reject(error);
          });
        }).on('error', (error) => {
          reject(error);
        });
      };

      downloadFile(downloadUrl);
    });
  }

  private async downloadFridaServerAlternative(
    version: string, 
    arch: string, 
    resolve: (value: void) => void, 
    reject: (reason: Error) => void
  ): Promise<void> {
    const fileName = `frida-server-${version}-android-${arch}`;
    const downloadUrl = `https://github.com/frida/frida/releases/download/${version}/${fileName}`;
    
    console.log(`📥 Alternative download: ${fileName}`);
    
    const file = fs.createWriteStream(this.fridaServerPath);
    
    const downloadFile = (url: string) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            console.log(`🔄 Following redirect to: ${redirectUrl}`);
            downloadFile(redirectUrl);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download alternative: ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          fs.chmodSync(this.fridaServerPath, 0o755);
          console.log('✅ Frida server downloaded (alternative)');
          resolve();
        });
        file.on('error', (error) => {
          reject(error);
        });
      }).on('error', (error) => {
        reject(error);
      });
    };

    downloadFile(downloadUrl);
  }

  private async detectDeviceArch(): Promise<string> {
    try {
      const { stdout } = await execAsync(`${this.adbPath} shell getprop ro.product.cpu.abi 2>/dev/null || echo "arm64"`);
      const arch = stdout.toString().trim();
      
      if (arch.includes('arm64')) return 'arm64';
      if (arch.includes('arm')) return 'arm';
      if (arch.includes('x86_64')) return 'x86_64';
      if (arch.includes('x86')) return 'x86';
      
      return 'arm64';
    } catch (error) {
      console.warn('⚠️ Could not detect device architecture, using arm64');
      return 'arm64';
    }
  }

  private async pushFridaServer(deviceId: string): Promise<void> {
    console.log('📤 Pushing Frida server to device...');

    try {
      await execAsync(
        `${this.adbPath} -s ${deviceId} push ${this.fridaServerPath} /data/local/tmp/frida-server`
      );
      
      await execAsync(
        `${this.adbPath} -s ${deviceId} shell chmod 755 /data/local/tmp/frida-server`
      );
      
      console.log('✅ Frida server pushed to device');
    } catch (error) {
      throw new Error(`Failed to push Frida server: ${error}`);
    }
  }

  private async installFridaOnDevice(deviceId: string): Promise<void> {
    console.log('🔧 Installing Frida on device...');

    try {
      await execAsync(
        `${this.adbPath} -s ${deviceId} shell su -c "/data/local/tmp/frida-server --version" 2>/dev/null`
      );
      console.log('✅ Frida installed with root');
    } catch (error) {
      try {
        await execAsync(
          `${this.adbPath} -s ${deviceId} shell "/data/local/tmp/frida-server --version"`
        );
        console.log('✅ Frida installed (non-root)');
      } catch (error) {
        throw new Error(`Failed to install Frida on device: ${error}`);
      }
    }
  }

  private async startFridaServer(deviceId: string): Promise<void> {
    console.log('▶️ Starting Frida server on device...');

    try {
      // Check if already running
      const { stdout } = await execAsync(
        `${this.adbPath} -s ${deviceId} shell "ps | grep frida-server"`
      );
    
      if (stdout.includes('frida-server')) {
        console.log('⚠️ Frida server already running');
        return;
      }

      // Start Frida server - using simpler command
      console.log('Starting Frida server process...');
      await execAsync(
        `${this.adbPath} -s ${deviceId} shell "nohup /data/local/tmp/frida-server > /dev/null 2>&1 &"`
      );

      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify server is running
      const { stdout: verifyOutput } = await execAsync(
        `${this.adbPath} -s ${deviceId} shell "ps | grep frida-server"`
      );

      if (verifyOutput.includes('frida-server')) {
        console.log('✅ Frida server started');
      
        // Forward ports for Frida
        await execAsync(`${this.adbPath} -s ${deviceId} forward tcp:27042 tcp:27042`);
        await execAsync(`${this.adbPath} -s ${deviceId} forward tcp:27043 tcp:27043`);
      
        console.log('✅ Frida ports forwarded');
      } else {
        // Try alternative start method
        console.log('⚠️ First attempt failed, trying alternative...');
      
        // Alternative: start as background process differently
        await execAsync(
          `${this.adbPath} -s ${deviceId} shell "/data/local/tmp/frida-server &"`
        );
      
        await new Promise(resolve => setTimeout(resolve, 3000));
      
        const { stdout: verifyOutput2 } = await execAsync(
          `${this.adbPath} -s ${deviceId} shell "ps | grep frida-server"`
        );
      
        if (verifyOutput2.includes('frida-server')) {
          console.log('✅ Frida server started (alternative)');
          await execAsync(`${this.adbPath} -s ${deviceId} forward tcp:27042 tcp:27042`);
          await execAsync(`${this.adbPath} -s ${deviceId} forward tcp:27043 tcp:27043`);
        } else {
          console.warn('⚠️ Frida server may not be running');
        }
      }
    } catch (error) {
      throw new Error(`Failed to start Frida server: ${error}`);
    }
  }

  private async verifyFridaInstallation(deviceId: string): Promise<void> {
    console.log('🔍 Verifying Frida installation...');

    try {
      const { stdout } = await execAsync(
        `${this.adbPath} -s ${deviceId} shell "/data/local/tmp/frida-server --version"`
      );
      
      if (stdout.trim()) {
        console.log(`✅ Frida server version: ${stdout.trim()}`);
      }
    } catch (error) {
      console.warn('⚠️ Frida verification failed:', error);
    }
  }

  async installFridaTools(): Promise<void> {
    console.log('📦 Installing Frida tools...');

    try {
      try {
        await execAsync('frida --version');
        console.log('✅ Frida tools already installed');
        return;
      } catch (error) {
        // Not installed
      }

      console.log('📦 Installing Frida via npm...');
      await execAsync('npm install -g frida-tools');
      console.log('✅ Frida tools installed');
    } catch (error) {
      console.warn('⚠️ Failed to install Frida tools:', error);
    }
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up...');
    
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.warn('⚠️ Cleanup failed:', error);
    }
  }
}

// CLI Entry Point
if (require.main === module) {
  const args = process.argv.slice(2);
  let skipADB = false;
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--skip-adb':
      case '-s':
        skipADB = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: npm run setup:frida [options]

Options:
  -s, --skip-adb    Skip ADB checks
  -h, --help        Show this help message
        `);
        process.exit(0);
        break;
    }
  }

  const setup = new FridaSetup({
    autoStart: true,
    skipADBCheck: skipADB,
  });

  setup.setup()
    .then(() => setup.installFridaTools())
    .then(() => {
      console.log(`
🎉 Frida setup completed!

Next steps:
1. Start an Android emulator or connect a device
2. Run: npm run capture-traffic
3. Use Frida scripts from ./frida-scripts directory
`);
    })
    .catch((error) => {
      console.error('Frida setup failed:', error);
      process.exit(1);
    });
}

export { FridaSetup };