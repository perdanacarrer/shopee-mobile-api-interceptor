import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { logger } from '../../utils/logger';

const execAsync = promisify(exec);

// Simple XML parser for manifest analysis
class SimpleXMLParser {
  async parseString(xml: string): Promise<any> {
    // Simple regex-based parsing for AndroidManifest.xml
    const result: any = {
      manifest: {
        $: {},
        'uses-permission': [],
        'uses-feature': [],
        application: [{
          $: {},
          activity: [],
          service: [],
          receiver: [],
          provider: []
        }]
      }
    };

    // Parse manifest attributes
    const manifestMatch = xml.match(/<manifest\s+([^>]*)>/);
    if (manifestMatch) {
      const attrs = manifestMatch[1];
      const packageMatch = attrs.match(/package=["']([^"']+)["']/);
      if (packageMatch) result.manifest.$.package = packageMatch[1];
      
      const versionCodeMatch = attrs.match(/android:versionCode=["']([^"']+)["']/);
      if (versionCodeMatch) result.manifest.$.versionCode = versionCodeMatch[1];
      
      const versionNameMatch = attrs.match(/android:versionName=["']([^"']+)["']/);
      if (versionNameMatch) result.manifest.$.versionName = versionNameMatch[1];
    }

    // Parse uses-sdk
    const sdkMatch = xml.match(/<uses-sdk\s+([^>]*)\/>/);
    if (sdkMatch) {
      const attrs = sdkMatch[1];
      const minMatch = attrs.match(/android:minSdkVersion=["']([^"']+)["']/);
      if (minMatch) result.manifest['uses-sdk'] = [{ $: { 'android:minSdkVersion': minMatch[1] } }];
    }

    // Parse permissions
    const permissionRegex = /<uses-permission\s+android:name=["']([^"']+)["']\s*\/>/g;
    let match;
    while ((match = permissionRegex.exec(xml)) !== null) {
      result.manifest['uses-permission'].push({ $: { 'android:name': match[1] } });
    }

    // Parse features
    const featureRegex = /<uses-feature\s+android:name=["']([^"']+)["']\s*\/>/g;
    while ((match = featureRegex.exec(xml)) !== null) {
      result.manifest['uses-feature'].push({ $: { 'android:name': match[1] } });
    }

    // Parse application
    const appMatch = xml.match(/<application\s+([^>]*)>/);
    if (appMatch) {
      const attrs = appMatch[1];
      const nameMatch = attrs.match(/android:name=["']([^"']+)["']/);
      if (nameMatch) result.manifest.application[0].$['android:name'] = nameMatch[1];
      
      const iconMatch = attrs.match(/android:icon=["']([^"']+)["']/);
      if (iconMatch) result.manifest.application[0].$['android:icon'] = iconMatch[1];
      
      const backupMatch = attrs.match(/android:allowBackup=["']([^"']+)["']/);
      if (backupMatch) result.manifest.application[0].$['android:allowBackup'] = backupMatch[1];
      
      const debuggableMatch = attrs.match(/android:debuggable=["']([^"']+)["']/);
      if (debuggableMatch) result.manifest.application[0].$['android:debuggable'] = debuggableMatch[1];
      
      const cleartextMatch = attrs.match(/android:usesCleartextTraffic=["']([^"']+)["']/);
      if (cleartextMatch) result.manifest.application[0].$['android:usesCleartextTraffic'] = cleartextMatch[1];
    }

    // Parse activities
    const activityRegex = /<activity\s+android:name=["']([^"']+)["'][^>]*>/g;
    while ((match = activityRegex.exec(xml)) !== null) {
      result.manifest.application[0].activity.push({ $: { 'android:name': match[1] } });
    }

    // Parse services
    const serviceRegex = /<service\s+android:name=["']([^"']+)["'][^>]*>/g;
    while ((match = serviceRegex.exec(xml)) !== null) {
      result.manifest.application[0].service.push({ $: { 'android:name': match[1] } });
    }

    return result;
  }
}

// Export types
export interface APIEndpoint {
  path: string;
  method: string;
  baseUrl: string;
  parameters: string[];
  headers: string[];
  responseType: string;
  authentication: string[];
  sourceFile: string;
  confidence: number;
}

export interface NetworkCall {
  url: string;
  method: string;
  headers: string[];
  parameters: string[];
  bodyPatterns: string[];
  sourceFile: string;
  lineNumber: number;
  confidence: number;
}

export interface SecurityIssue {
  type: 'vulnerability' | 'misconfiguration' | 'weakness' | 'risk';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  location: string;
  recommendation: string;
}

export class APKAnalyzer extends EventEmitter {
  private config: any;
  private result: any;
  private tempDir: string;
  private parser: SimpleXMLParser;

  constructor(config: any) {
    super();
    this.config = config;
    this.parser = new SimpleXMLParser();
    this.result = this.initializeResult();
    this.tempDir = path.join(this.config.outputDir, 'temp');
  }

  private initializeResult() {
    return {
      manifest: {
        packageName: '',
        versionCode: '',
        versionName: '',
        minSdkVersion: 0,
        targetSdkVersion: 0,
        permissions: [],
        activities: [],
        services: [],
        receivers: [],
        providers: [],
        usesFeatures: [],
        application: {
          name: '',
          icon: '',
          allowBackup: false,
          debuggable: false,
          usesCleartextTraffic: false,
        },
      },
      classes: [],
      resources: [],
      networkCalls: [] as NetworkCall[],
      securityIssues: [] as SecurityIssue[],
      apiEndpoints: [] as APIEndpoint[],
      certificates: [],
      dependencies: [],
      fileStructure: {
        totalFiles: 0,
        totalSize: 0,
        directories: [],
        files: [],
        largestFiles: [],
      },
      metadata: {
        fileName: '',
        fileSize: 0,
        hash: '',
        analyzedAt: new Date(),
        duration: 0,
        toolsUsed: [],
      },
    };
  }

  async analyze(apkPath?: string): Promise<any> {
    const startTime = Date.now();
    
    if (apkPath) {
      this.config.apkPath = apkPath;
    }

    if (!this.config.apkPath || !fs.existsSync(this.config.apkPath)) {
      throw new Error(`APK file not found: ${this.config.apkPath}`);
    }

    logger.info(`Analyzing APK: ${this.config.apkPath}`);

    try {
      // Basic file analysis
      await this.basicFileAnalysis();

      // Try to extract using simple zip (APK is a zip file)
      await this.extractAPK();

      // Analyze manifest if found
      if (this.config.analyzeManifest) {
        await this.analyzeManifest();
      }

      // Search for network calls in the extracted files
      if (this.config.analyzeNetwork) {
        await this.searchNetworkCalls();
      }

      // Analyze security
      if (this.config.analyzeSecurity) {
        await this.analyzeSecurity();
      }

      // Collect findings
      await this.collectFindings();

      this.result.metadata.duration = Date.now() - startTime;
      await this.generateReport();

      return this.result;
    } catch (error) {
      logger.error('APK analysis failed:', error);
      throw error;
    }
  }

  private async basicFileAnalysis(): Promise<void> {
    const stats = fs.statSync(this.config.apkPath);
    
    this.result.metadata.fileName = path.basename(this.config.apkPath);
    this.result.metadata.fileSize = stats.size;
    this.result.metadata.hash = this.calculateHash(this.config.apkPath);
  }

  private calculateHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  }

  private async extractAPK(): Promise<void> {
    logger.info('Extracting APK...');
    
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(this.config.apkPath);
      const outputDir = path.join(this.config.outputDir, 'decompiled');
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      zip.extractAllTo(outputDir, true);
      logger.info('APK extracted successfully');
    } catch (error) {
      logger.warn('Could not extract APK:', error);
    }
  }

  private async analyzeManifest(): Promise<void> {
    logger.info('Analyzing AndroidManifest.xml...');

    try {
      const manifestPath = path.join(this.config.outputDir, 'decompiled', 'AndroidManifest.xml');
      
      if (!fs.existsSync(manifestPath)) {
        logger.warn('AndroidManifest.xml not found');
        return;
      }

      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      const parsed = await this.parser.parseString(manifestContent);

      const manifest = parsed.manifest;
      
      // Extract basic info
      this.result.manifest.packageName = manifest.$.package || '';
      this.result.manifest.versionCode = manifest.$.versionCode || '';
      this.result.manifest.versionName = manifest.$.versionName || '';

      // Extract SDK versions
      const usesSdk = manifest['uses-sdk']?.[0]?.$ || {};
      this.result.manifest.minSdkVersion = parseInt(usesSdk['android:minSdkVersion'] || '0');
      this.result.manifest.targetSdkVersion = parseInt(usesSdk['android:targetSdkVersion'] || '0');

      // Extract permissions
      const permissions = manifest['uses-permission'] || [];
      this.result.manifest.permissions = permissions.map((p: any) => p.$['android:name']);

      // Extract features
      const features = manifest['uses-feature'] || [];
      this.result.manifest.usesFeatures = features.map((f: any) => f.$['android:name']);

      // Extract application info
      const application = manifest.application?.[0]?.$ || {};
      this.result.manifest.application = {
        name: application['android:name'] || '',
        icon: application['android:icon'] || '',
        allowBackup: application['android:allowBackup'] === 'true',
        debuggable: application['android:debuggable'] === 'true',
        usesCleartextTraffic: application['android:usesCleartextTraffic'] === 'true',
      };

      // Extract components
      const activities = manifest.application?.[0]?.activity || [];
      this.result.manifest.activities = activities.map((a: any) => a.$['android:name']);

      const services = manifest.application?.[0]?.service || [];
      this.result.manifest.services = services.map((s: any) => s.$['android:name']);

      const receivers = manifest.application?.[0]?.receiver || [];
      this.result.manifest.receivers = receivers.map((r: any) => r.$['android:name']);

      const providers = manifest.application?.[0]?.provider || [];
      this.result.manifest.providers = providers.map((p: any) => p.$['android:name']);

      logger.info('Manifest analysis completed');
    } catch (error) {
      logger.error('Manifest analysis failed:', error);
    }
  }

  private async searchNetworkCalls(): Promise<void> {
    logger.info('Searching for network calls...');

    const baseDir = path.join(this.config.outputDir, 'decompiled');
    
    if (!fs.existsSync(baseDir)) {
      logger.warn('Decompiled directory not found');
      return;
    }

    const files = this.getAllFiles(baseDir);
    const networkPatterns = [
      /https?:\/\/[^\s<>"']+/gi,
      /HttpURLConnection/gi,
      /OkHttpClient/gi,
      /Retrofit/gi,
      /Volley/gi,
      /Fetch|fetch/gi,
      /XMLHttpRequest/gi,
      /axios/gi,
      /\.get\(|\.post\(|\.put\(|\.delete\(|\.patch\(/gi,
    ];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          for (const pattern of networkPatterns) {
            const matches = line.match(pattern);
            if (matches) {
              for (const match of matches) {
                // Extract URL
                const urlMatch = match.match(/https?:\/\/[^\s<>"']+/);
                if (urlMatch) {
                  this.result.networkCalls.push({
                    url: urlMatch[0],
                    method: this.detectMethod(line),
                    headers: [],
                    parameters: [],
                    bodyPatterns: [],
                    sourceFile: path.relative(baseDir, file),
                    lineNumber: i + 1,
                    confidence: 0.7,
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        // Skip unreadable files
      }
    }

    // Analyze endpoints from network calls
    this.analyzeEndpoints();

    logger.info(`Found ${this.result.networkCalls.length} network calls`);
  }

  private detectMethod(line: string): string {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    for (const method of methods) {
      if (line.includes(`"${method}"`) || line.includes(`'${method}'`)) {
        return method;
      }
    }
    if (line.includes('.get(')) return 'GET';
    if (line.includes('.post(')) return 'POST';
    if (line.includes('.put(')) return 'PUT';
    if (line.includes('.delete(')) return 'DELETE';
    if (line.includes('.patch(')) return 'PATCH';
    return 'UNKNOWN';
  }

  private analyzeEndpoints(): void {
    const endpoints = new Map<string, APIEndpoint>();

    for (const call of this.result.networkCalls) {
      try {
        const url = new URL(call.url);
        const baseUrl = `${url.protocol}//${url.host}`;
        const path = url.pathname;

        const key = `${baseUrl}:${path}`;
        
        if (!endpoints.has(key)) {
          endpoints.set(key, {
            path,
            method: call.method,
            baseUrl,
            parameters: [],
            headers: [],
            responseType: 'unknown',
            authentication: [],
            sourceFile: call.sourceFile,
            confidence: call.confidence,
          });
        }
      } catch (error) {
        // Invalid URL, skip
      }
    }

    this.result.apiEndpoints = Array.from(endpoints.values());
  }

  private async analyzeSecurity(): Promise<void> {
    logger.info('Analyzing security...');

    const manifest = this.result.manifest;

    // Check debuggable
    if (manifest.application.debuggable) {
      this.result.securityIssues.push({
        type: 'misconfiguration',
        severity: 'high',
        title: 'Debuggable Application',
        description: 'The application is debuggable, which can lead to security risks.',
        location: 'AndroidManifest.xml',
        recommendation: 'Remove android:debuggable="true" from manifest.',
      });
    }

    // Check cleartext traffic
    if (manifest.application.usesCleartextTraffic) {
      this.result.securityIssues.push({
        type: 'vulnerability',
        severity: 'high',
        title: 'Cleartext Traffic Allowed',
        description: 'The application allows cleartext HTTP traffic, which can be intercepted.',
        location: 'AndroidManifest.xml',
        recommendation: 'Disable cleartext traffic and enforce HTTPS.',
      });
    }

    // Check permissions
    const dangerousPermissions = [
      'READ_CONTACTS',
      'READ_SMS',
      'READ_CALL_LOG',
      'CAMERA',
      'RECORD_AUDIO',
      'ACCESS_FINE_LOCATION',
      'READ_EXTERNAL_STORAGE',
      'READ_PHONE_STATE',
    ];

    for (const perm of manifest.permissions) {
      for (const dangerous of dangerousPermissions) {
        if (perm.includes(dangerous)) {
          this.result.securityIssues.push({
            type: 'risk',
            severity: 'medium',
            title: `Dangerous Permission: ${dangerous}`,
            description: `The application requests the ${dangerous} permission.`,
            location: 'AndroidManifest.xml',
            recommendation: `Review if ${dangerous} permission is necessary.`,
          });
        }
      }
    }

    logger.info(`Found ${this.result.securityIssues.length} security issues`);
  }

  private getAllFiles(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        results = results.concat(this.getAllFiles(filePath));
      } else {
        results.push(filePath);
      }
    }
    return results;
  }

  private async collectFindings(): Promise<void> {
    const decompiledDir = path.join(this.config.outputDir, 'decompiled');
    if (!fs.existsSync(decompiledDir)) return;

    const allFiles = this.getAllFiles(decompiledDir);
    const fileStats = allFiles.map(f => ({
      name: f,
      size: fs.statSync(f).size,
    }));

    this.result.fileStructure.totalFiles = allFiles.length;
    this.result.fileStructure.totalSize = fileStats.reduce((sum, f) => sum + f.size, 0);
    this.result.fileStructure.directories = this.getDirectories(decompiledDir);
    this.result.fileStructure.files = fileStats.map(f => path.relative(decompiledDir, f.name));
    this.result.fileStructure.largestFiles = fileStats
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map(f => ({
        name: path.relative(decompiledDir, f.name),
        size: f.size,
      }));

    // Collect Java/Kotlin files as classes
    this.result.classes = allFiles
      .filter(f => f.endsWith('.java') || f.endsWith('.kt'))
      .map(f => path.relative(decompiledDir, f));
  }

  private getDirectories(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        results.push(path.relative(this.config.outputDir, filePath));
        results.push(...this.getDirectories(filePath));
      }
    }
    return results;
  }

  private async generateReport(): Promise<void> {
    const reportPath = path.join(
      this.config.outputDir, 
      'reports', 
      `analysis_report_${Date.now()}.json`
    );
    
    const reportsDir = path.dirname(reportPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, JSON.stringify(this.result, null, 2));
    logger.info(`Report saved: ${reportPath}`);
  }

  getResult(): any {
    return this.result;
  }

  getManifest(): any {
    return this.result.manifest;
  }

  getEndpoints(): APIEndpoint[] {
    return this.result.apiEndpoints;
  }

  getSecurityIssues(): SecurityIssue[] {
    return this.result.securityIssues;
  }

  getNetworkCalls(): NetworkCall[] {
    return this.result.networkCalls;
  }

  cleanup(): void {
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    }
  }
}

export default APKAnalyzer;