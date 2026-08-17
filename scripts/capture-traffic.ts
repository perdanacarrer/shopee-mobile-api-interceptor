#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { MITMProxyServer, InterceptedRequest, InterceptedResponse } from '../src/mobile/interception/proxy-server';
import { RequestLogger } from '../src/mobile/interception/request-logger';
import { PatternAnalyzer } from '../src/mobile/interception/pattern-analyzer';
import { logger } from '../src/utils/logger';

const execAsync = promisify(exec);

interface TrafficCaptureConfig {
  duration?: number;
  packageName?: string;
  outputDir?: string;
  captureRequests?: boolean;
  captureResponses?: boolean;
  filterDomains?: string[];
  verbose?: boolean;
}

class TrafficCapture {
  private config: TrafficCaptureConfig;
  private proxy: MITMProxyServer;
  private logger: RequestLogger;
  private analyzer: PatternAnalyzer;
  private capturedData: {
    requests: InterceptedRequest[];
    responses: InterceptedResponse[];
  };
  private isCapturing: boolean = false;

  constructor(config: TrafficCaptureConfig = {}) {
    this.config = {
      duration: 60,
      packageName: 'com.shopee.id',
      outputDir: './captured-traffic',
      captureRequests: true,
      captureResponses: true,
      filterDomains: ['shopee.co.id', 'shopee.com', 'shopee.sg'],
      verbose: false,
      ...config,
    };

    this.capturedData = {
      requests: [],
      responses: [],
    };

    this.setupDirectories();
    this.setupComponents();
  }

  private setupDirectories(): void {
    if (!fs.existsSync(this.config.outputDir!)) {
      fs.mkdirSync(this.config.outputDir!, { recursive: true });
    }

    const subdirs = ['requests', 'responses', 'patterns', 'logs'];
    subdirs.forEach(dir => {
      const fullPath = path.join(this.config.outputDir!, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  }

  private setupComponents(): void {
    // Setup logger
    this.logger = new RequestLogger({
      logDir: path.join(this.config.outputDir!, 'logs'),
      maxFileSize: 50 * 1024 * 1024,
      rotateDaily: true,
      compressLogs: true,
      logRequestBody: true,
      logResponseBody: true,
      maxBodySize: 2 * 1024 * 1024,
    });

    // Setup pattern analyzer
    this.analyzer = new PatternAnalyzer({
      minOccurrences: 3,
      confidenceThreshold: 0.7,
      ignoreStaticValues: true,
      maxPatternLength: 100,
    });

    // Setup proxy server
    this.proxy = new MITMProxyServer({
      port: 8080,
      host: '0.0.0.0',
      enableInterception: true,
      filterDomains: this.config.filterDomains!,
    });

    // Setup event handlers
    this.proxy.on('request', (request: InterceptedRequest) => {
      if (this.config.captureRequests) {
        this.capturedData.requests.push(request);
        this.onRequest(request);
      }
    });

    this.proxy.on('response', (response: InterceptedResponse) => {
      if (this.config.captureResponses) {
        this.capturedData.responses.push(response);
        this.onResponse(response);
      }
    });

    this.analyzer.on('pattern-identified', (pattern) => {
      this.onPatternIdentified(pattern);
    });
  }

  private onRequest(request: InterceptedRequest): void {
    if (this.config.verbose) {
      console.log(`📤 ${request.method} ${request.url}`);
    }

    // Save request to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `request_${timestamp}_${request.id}.json`;
    const filepath = path.join(this.config.outputDir!, 'requests', filename);
    
    try {
      fs.writeFileSync(filepath, JSON.stringify(request, null, 2));
    } catch (error) {
      logger.error('Failed to save request', { error, requestId: request.id });
    }
  }

  private onResponse(response: InterceptedResponse): void {
    if (this.config.verbose) {
      console.log(`📥 ${response.statusCode} (${response.id})`);
    }

    // Save response to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `response_${timestamp}_${response.id}.json`;
    const filepath = path.join(this.config.outputDir!, 'responses', filename);
    
    try {
      fs.writeFileSync(filepath, JSON.stringify(response, null, 2));
    } catch (error) {
      logger.error('Failed to save response', { error, responseId: response.id });
    }
  }

  private onPatternIdentified(pattern: any): void {
    console.log(`🔍 Pattern identified: ${pattern.method} ${pattern.endpoint}`);
    console.log(`   Frequency: ${pattern.frequency}, Confidence: ${pattern.confidence}`);

    // Save pattern
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `pattern_${timestamp}_${pattern.method}_${pattern.endpoint.replace(/\//g, '_')}.json`;
    const filepath = path.join(this.config.outputDir!, 'patterns', filename);
    
    try {
      fs.writeFileSync(filepath, JSON.stringify(pattern, null, 2));
    } catch (error) {
      logger.error('Failed to save pattern', { error });
    }
  }

  async start(): Promise<void> {
    console.log('🚀 Starting traffic capture...');
    console.log(`📱 Target app: ${this.config.packageName}`);
    console.log(`⏱️ Duration: ${this.config.duration} seconds`);
    console.log(`📁 Output directory: ${this.config.outputDir}`);

    try {
      // Start proxy
      await this.proxy.start();
      console.log('✅ Proxy server started on port 8080');

      // Start the target app
      await this.startApp();
      console.log('✅ App started');

      // Set device proxy
      await this.setDeviceProxy();
      console.log('✅ Device proxy configured');

      // Start capturing
      this.isCapturing = true;
      console.log('📡 Capturing traffic...');

      // Auto-stop after duration
      if (this.config.duration && this.config.duration > 0) {
        setTimeout(async () => {
          await this.stop();
        }, this.config.duration * 1000);
      }

    } catch (error) {
      console.error('❌ Failed to start traffic capture:', error);
      await this.stop();
      throw error;
    }
  }

  private async startApp(): Promise<void> {
    try {
      // Force stop the app first
      await execAsync(`adb shell am force-stop ${this.config.packageName}`);
      
      // Clear app data to start fresh
      await execAsync(`adb shell pm clear ${this.config.packageName}`).catch(() => {
        // Clear might fail, continue
      });

      // Start the app
      await execAsync(`adb shell monkey -p ${this.config.packageName} 1`);
      
      // Wait for app to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log(`✅ App ${this.config.packageName} started`);
    } catch (error) {
      throw new Error(`Failed to start app: ${error}`);
    }
  }

  private async setDeviceProxy(): Promise<void> {
    try {
      // Set HTTP proxy
      await execAsync('adb shell settings put global http_proxy 127.0.0.1:8080');
      
      // Set HTTPS proxy
      await execAsync('adb shell settings put global https_proxy 127.0.0.1:8080');
      
      console.log('✅ Device proxy configured');
    } catch (error) {
      console.warn('⚠️ Failed to set device proxy:', error);
    }
  }

  private async clearDeviceProxy(): Promise<void> {
    try {
      await execAsync('adb shell settings delete global http_proxy');
      await execAsync('adb shell settings delete global https_proxy');
      console.log('✅ Device proxy cleared');
    } catch (error) {
      console.warn('⚠️ Failed to clear device proxy:', error);
    }
  }

  async stop(): Promise<void> {
    if (!this.isCapturing) return;

    console.log('🛑 Stopping traffic capture...');
    this.isCapturing = false;

    try {
      // Stop proxy
      await this.proxy.stop();
      
      // Clear proxy settings
      await this.clearDeviceProxy();
      
      // Stop the app
      await execAsync(`adb shell am force-stop ${this.config.packageName}`);
      
      // Generate report
      await this.generateReport();
      
      console.log('✅ Traffic capture stopped');
      console.log(`📊 Captured ${this.capturedData.requests.length} requests, ${this.capturedData.responses.length} responses`);
      console.log(`📁 Data saved to ${this.config.outputDir}`);
      
    } catch (error) {
      console.error('❌ Error during stop:', error);
    }
  }

  private async generateReport(): Promise<void> {
    console.log('📊 Generating capture report...');

    const report = {
      timestamp: new Date().toISOString(),
      duration: this.config.duration,
      packageName: this.config.packageName,
      statistics: {
        totalRequests: this.capturedData.requests.length,
        totalResponses: this.capturedData.responses.length,
        uniqueEndpoints: new Set(this.capturedData.requests.map(r => r.url)).size,
        methods: this.getMethodDistribution(),
        statusCodes: this.getStatusDistribution(),
      },
      patterns: this.analyzer.getHighConfidencePatterns(),
      topEndpoints: this.getTopEndpoints(10),
    };

    const reportPath = path.join(this.config.outputDir!, `capture_report_${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📄 Report saved: ${reportPath}`);
    
    // Display summary
    console.log('\n📊 Capture Summary:');
    console.log(`  Total Requests: ${report.statistics.totalRequests}`);
    console.log(`  Total Responses: ${report.statistics.totalResponses}`);
    console.log(`  Unique Endpoints: ${report.statistics.uniqueEndpoints}`);
    console.log(`  Identified Patterns: ${report.patterns.length}`);
    console.log('\n  Top Endpoints:');
    report.topEndpoints.forEach((endpoint, index) => {
      console.log(`    ${index + 1}. ${endpoint.url} (${endpoint.count} requests)`);
    });
  }

  private getMethodDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    this.capturedData.requests.forEach(req => {
      distribution[req.method] = (distribution[req.method] || 0) + 1;
    });
    return distribution;
  }

  private getStatusDistribution(): Record<number, number> {
    const distribution: Record<number, number> = {};
    this.capturedData.responses.forEach(res => {
      distribution[res.statusCode] = (distribution[res.statusCode] || 0) + 1;
    });
    return distribution;
  }

  private getTopEndpoints(limit: number): Array<{url: string, count: number}> {
    const endpointCount: Record<string, number> = {};
    this.capturedData.requests.forEach(req => {
      const url = req.url.split('?')[0]; // Remove query params
      endpointCount[url] = (endpointCount[url] || 0) + 1;
    });
    
    return Object.entries(endpointCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([url, count]) => ({ url, count }));
  }

  async captureAndAnalyze(): Promise<any> {
    await this.start();
    
    // Wait for capture to complete
    while (this.isCapturing) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return {
      requests: this.capturedData.requests,
      responses: this.capturedData.responses,
      patterns: this.analyzer.getHighConfidencePatterns(),
      statistics: this.getMethodDistribution(),
    };
  }
}

// CLI Entry Point
if (require.main === module) {
  const args = process.argv.slice(2);
  const config: TrafficCaptureConfig = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--duration':
      case '-d':
        config.duration = parseInt(args[++i]);
        break;
      case '--package':
      case '-p':
        config.packageName = args[++i];
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
Usage: npm run capture-traffic [options]

Options:
  -d, --duration <seconds>   Duration to capture traffic (default: 60)
  -p, --package <name>       Target app package name (default: com.shopee.id)
  -o, --output <dir>         Output directory (default: ./captured-traffic)
  -v, --verbose              Enable verbose logging
  -h, --help                 Show this help message

Examples:
  npm run capture-traffic -- -d 120 -p com.shopee.id
  npm run capture-traffic -- -v -o ./my-traffic
        `);
        process.exit(0);
        break;
    }
  }

  const capture = new TrafficCapture(config);
  
  capture.start()
    .then(() => {
      console.log(`
🎯 Traffic capture running!

To stop early, press Ctrl+C

Captured data will be saved to: ${config.outputDir || './captured-traffic'}
      `);
    })
    .catch((error) => {
      console.error('❌ Traffic capture failed:', error);
      process.exit(1);
    });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Interrupt received, stopping...');
    await capture.stop();
    process.exit(0);
  });
}

export { TrafficCapture };