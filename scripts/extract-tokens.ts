#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { logger } from '../src/utils/logger';

const execAsync = promisify(exec);

interface TokenExtractionConfig {
  deviceId?: string;
  packageName?: string;
  outputFile?: string;
  useFrida?: boolean;
  useADB?: boolean;
  interactive?: boolean;
}

interface ExtractedToken {
  key: string;
  value: string;
  type: 'access_token' | 'refresh_token' | 'device_token' | 'session_token' | 'unknown';
  source: string;
  timestamp: Date;
}

class TokenExtractor {
  private config: TokenExtractionConfig;
  private tokens: ExtractedToken[] = [];
  private adbPath: string;

  constructor(config: TokenExtractionConfig = {}) {
    this.config = {
      packageName: 'com.shopee.id',
      outputFile: './tokens-extracted.json',
      useFrida: true,
      useADB: true,
      interactive: false,
      ...config,
    };

    this.adbPath = this.detectAdbPath();
  }

  private detectAdbPath(): string {
    const androidHome = process.env.ANDROID_HOME;
    if (androidHome) {
      return path.join(androidHome, 'platform-tools', 'adb');
    }
    return 'adb';
  }

  async extractTokens(): Promise<ExtractedToken[]> {
    console.log('🔑 Starting token extraction...');

    try {
      // Get device if not specified
      const deviceId = await this.getDevice();
      
      console.log(`📱 Using device: ${deviceId}`);
      
      // Extract via different methods
      if (this.config.useADB) {
        await this.extractViaADB(deviceId);
      }
      
      if (this.config.useFrida) {
        await this.extractViaFrida(deviceId);
      }
      
      // Deduplicate tokens
      this.deduplicateTokens();
      
      // Save tokens
      await this.saveTokens();
      
      // Display summary
      this.displayTokens();
      
      return this.tokens;
      
    } catch (error) {
      console.error('❌ Token extraction failed:', error);
      throw error;
    }
  }

  private async getDevice(): Promise<string> {
    if (this.config.deviceId) {
      return this.config.deviceId;
    }

    try {
      const { stdout } = await execAsync(`${this.adbPath} devices`);
      const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('List of devices'));
      
      if (lines.length === 0) {
        throw new Error('No devices connected. Please connect a device or start an emulator.');
      }

      if (lines.length === 1 || !this.config.interactive) {
        return lines[0].split('\t')[0];
      }

      // Interactive selection
      console.log('📱 Multiple devices found:');
      lines.forEach((line, index) => {
        const [id, status] = line.split('\t');
        console.log(`  ${index + 1}. ${id} (${status})`);
      });

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      return new Promise((resolve) => {
        rl.question('Select device number: ', (answer) => {
          rl.close();
          const index = parseInt(answer) - 1;
          if (index >= 0 && index < lines.length) {
            resolve(lines[index].split('\t')[0]);
          } else {
            console.log('Invalid selection, using first device');
            resolve(lines[0].split('\t')[0]);
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to get device: ${error}`);
    }
  }

  private async extractViaADB(deviceId: string): Promise<void> {
    console.log('🔍 Extracting tokens via ADB...');

    try {
      // Extract from SharedPreferences
      const sharedPrefs = await this.getSharedPreferences(deviceId);
      
      // Parse SharedPreferences for tokens
      const tokens = this.parseSharedPreferences(sharedPrefs);
      this.tokens.push(...tokens);
      
      console.log(`✅ Extracted ${tokens.length} tokens via ADB`);
      
    } catch (error) {
      console.warn('⚠️ ADB extraction failed:', error);
    }
  }

  private async getSharedPreferences(deviceId: string): Promise<any[]> {
    try {
      // Get list of shared preferences files
      const { stdout } = await execAsync(
        `${this.adbPath} -s ${deviceId} shell "run-as ${this.config.packageName} ls /data/data/${this.config.packageName}/shared_prefs/"`
      );
      
      const files = stdout.split('\n').filter(f => f.endsWith('.xml'));
      const results: any[] = [];
      
      for (const file of files) {
        try {
          const { stdout: content } = await execAsync(
            `${this.adbPath} -s ${deviceId} shell "run-as ${this.config.packageName} cat /data/data/${this.config.packageName}/shared_prefs/${file}"`
          );
          
          results.push({
            file,
            content,
          });
        } catch (error) {
          console.warn(`⚠️ Could not read ${file}`);
        }
      }
      
      return results;
    } catch (error) {
      throw new Error(`Failed to get shared preferences: ${error}`);
    }
  }

  private parseSharedPreferences(prefs: any[]): ExtractedToken[] {
    const tokens: ExtractedToken[] = [];
    const tokenPatterns = [
      /access[_-]?token/i,
      /refresh[_-]?token/i,
      /device[_-]?token/i,
      /session[_-]?token/i,
      /auth[_-]?token/i,
      /bearer[_-]?token/i,
      /jwt/i,
      /token/i,
    ];

    for (const pref of prefs) {
      // Simple XML parsing
      const lines = pref.content.split('\n');
      for (const line of lines) {
        // Look for token-like values
        for (const pattern of tokenPatterns) {
          if (pattern.test(line)) {
            // Extract key and value
            const keyMatch = line.match(/name=["']([^"']+)["']/);
            const valueMatch = line.match(/value=["']([^"']+)["']/);
            
            if (keyMatch && valueMatch) {
              const value = valueMatch[1];
              // Check if it looks like a token
              if (value.length > 20) {
                tokens.push({
                  key: keyMatch[1],
                  value,
                  type: this.detectTokenType(keyMatch[1], value),
                  source: `SharedPreferences: ${pref.file}`,
                  timestamp: new Date(),
                });
              }
            }
          }
        }
      }
    }

    return tokens;
  }

  private async extractViaFrida(deviceId: string): Promise<void> {
    console.log('🔍 Extracting tokens via Frida...');

    const scriptPath = path.join(__dirname, '../frida-scripts/token-grabber.js');
    
    if (!fs.existsSync(scriptPath)) {
      console.warn('⚠️ Frida script not found:', scriptPath);
      return;
    }

    try {
      // Start Frida process
      const fridaCmd = `frida -U -f ${this.config.packageName} -l ${scriptPath}`;
      const child = exec(fridaCmd);

      // Process output
      child.stdout?.on('data', (data) => {
        const output = data.toString();
        // Parse Frida output for tokens
        const tokenMatches = output.match(/Token found: ([^=]+) = ([^\n]+)/);
        if (tokenMatches) {
          const token: ExtractedToken = {
            key: tokenMatches[1].trim(),
            value: tokenMatches[2].trim(),
            type: this.detectTokenType(tokenMatches[1].trim(), tokenMatches[2].trim()),
            source: 'Frida Injection',
            timestamp: new Date(),
          };
          this.tokens.push(token);
          console.log(`✅ Extracted token via Frida: ${token.key}`);
        }
      });

      // Wait for extraction
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Kill Frida process
      child.kill();
      
    } catch (error) {
      console.warn('⚠️ Frida extraction failed:', error);
    }
  }

  private detectTokenType(key: string, value: string): ExtractedToken['type'] {
    const keyLower = key.toLowerCase();
    const valueLower = value.toLowerCase();

    if (keyLower.includes('access') || keyLower.includes('bearer')) {
      return 'access_token';
    }
    if (keyLower.includes('refresh')) {
      return 'refresh_token';
    }
    if (keyLower.includes('device')) {
      return 'device_token';
    }
    if (keyLower.includes('session')) {
      return 'session_token';
    }
    if (valueLower.includes('access')) {
      return 'access_token';
    }
    if (valueLower.includes('refresh')) {
      return 'refresh_token';
    }
    if (valueLower.includes('device')) {
      return 'device_token';
    }
    if (valueLower.includes('session')) {
      return 'session_token';
    }

    return 'unknown';
  }

  private deduplicateTokens(): void {
    const uniqueTokens = new Map<string, ExtractedToken>();
    
    for (const token of this.tokens) {
      const key = `${token.key}:${token.value}`;
      if (!uniqueTokens.has(key)) {
        uniqueTokens.set(key, token);
      }
    }
    
    this.tokens = Array.from(uniqueTokens.values());
  }

  private async saveTokens(): Promise<void> {
    const outputPath = this.config.outputFile!;
    
    const data = {
      timestamp: new Date().toISOString(),
      packageName: this.config.packageName,
      totalTokens: this.tokens.length,
      tokens: this.tokens,
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`✅ Tokens saved to: ${outputPath}`);
  }

  private displayTokens(): void {
    console.log('\n🔑 Extracted Tokens:');
    console.log('='.repeat(80));
    
    if (this.tokens.length === 0) {
      console.log('No tokens found.');
      return;
    }

    this.tokens.forEach((token, index) => {
      console.log(`\nToken ${index + 1}:`);
      console.log(`  Key: ${token.key}`);
      console.log(`  Type: ${token.type}`);
      console.log(`  Value: ${this.maskValue(token.value)}`);
      console.log(`  Source: ${token.source}`);
    });

    // Summary by type
    console.log('\n📊 Summary by Type:');
    const typeSummary = this.tokens.reduce((acc, token) => {
      acc[token.type] = (acc[token.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(typeSummary).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  }

  private maskValue(value: string): string {
    if (value.length <= 20) return value;
    return value.substring(0, 10) + '...' + value.substring(value.length - 10);
  }

  async extractAndFormat(): Promise<any> {
    const tokens = await this.extractTokens();
    
    // Format tokens for use in configuration
    const formatted = {
      accessToken: tokens.find(t => t.type === 'access_token')?.value || null,
      refreshToken: tokens.find(t => t.type === 'refresh_token')?.value || null,
      deviceToken: tokens.find(t => t.type === 'device_token')?.value || null,
      sessionToken: tokens.find(t => t.type === 'session_token')?.value || null,
    };

    return formatted;
  }
}

// CLI Entry Point
if (require.main === module) {
  const args = process.argv.slice(2);
  const config: TokenExtractionConfig = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--device':
      case '-d':
        config.deviceId = args[++i];
        break;
      case '--package':
      case '-p':
        config.packageName = args[++i];
        break;
      case '--output':
      case '-o':
        config.outputFile = args[++i];
        break;
      case '--interactive':
        config.interactive = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: npm run extract-tokens [options]

Options:
  -d, --device <id>      Device ID (default: auto-detect)
  -p, --package <name>   App package name (default: com.shopee.id)
  -o, --output <file>    Output file (default: ./tokens-extracted.json)
  --interactive          Interactive mode for device selection
  -h, --help             Show this help message

Examples:
  npm run extract-tokens -- -p com.shopee.id
  npm run extract-tokens -- -o ./my-tokens.json --interactive
        `);
        process.exit(0);
        break;
    }
  }

  const extractor = new TokenExtractor(config);
  
  extractor.extractTokens()
    .then(() => {
      console.log('\n🎉 Token extraction completed!');
    })
    .catch((error) => {
      console.error('❌ Token extraction failed:', error);
      process.exit(1);
    });
}

export { TokenExtractor };