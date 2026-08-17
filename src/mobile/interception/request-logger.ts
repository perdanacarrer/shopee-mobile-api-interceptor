import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

export interface LoggerConfig {
  logDir: string;
  maxFileSize: number;
  rotateDaily: boolean;
  compressLogs: boolean;
  logRequestBody: boolean;
  logResponseBody: boolean;
  maxBodySize: number;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'request' | 'response';
  data: any;
}

export class RequestLogger extends EventEmitter {
  private config: LoggerConfig;
  private currentLogFile: string;
  private logStream: fs.WriteStream;
  private fileSize: number = 0;
  private currentDate: string;

  constructor(config: Partial<LoggerConfig> = {}) {
    super();
    
    this.config = {
      logDir: './logs/proxy',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      rotateDaily: true,
      compressLogs: true,
      logRequestBody: true,
      logResponseBody: true,
      maxBodySize: 1024 * 1024, // 1MB
      ...config,
    };

    this.ensureLogDirectory();
    this.currentDate = this.getCurrentDateString();
    this.currentLogFile = this.generateLogFileName();
    this.logStream = this.createLogStream();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  private createLogStream(): fs.WriteStream {
    const flags = fs.existsSync(this.currentLogFile) ? 'a' : 'w';
    return fs.createWriteStream(this.currentLogFile, { flags });
  }

  private generateLogFileName(): string {
    const timestamp = this.currentDate;
    return path.join(this.config.logDir, `proxy-log-${timestamp}.log`);
  }

  private getCurrentDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private truncateBody(body: Buffer | string): any {
    if (!body) return null;
    
    let bodyStr = typeof body === 'string' ? body : body.toString('utf8');
    
    if (bodyStr.length > this.config.maxBodySize) {
      bodyStr = bodyStr.substring(0, this.config.maxBodySize) + '... [TRUNCATED]';
    }
    
    // Try to parse JSON
    try {
      return JSON.parse(bodyStr);
    } catch {
      return bodyStr;
    }
  }

  async logRequest(request: any): Promise<void> {
    const entry: LogEntry = {
      id: request.id,
      timestamp: request.timestamp || new Date(),
      type: 'request',
      data: {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: this.config.logRequestBody ? this.truncateBody(request.body) : undefined,
        query: request.query,
        ip: request.ip,
        userAgent: request.headers?.['user-agent'] || request.headers?.['User-Agent'],
      },
    };

    await this.writeLog(entry);
    this.emit('request-logged', request);
  }

  async logResponse(response: any): Promise<void> {
    const entry: LogEntry = {
      id: response.id,
      timestamp: response.timestamp || new Date(),
      type: 'response',
      data: {
        statusCode: response.statusCode,
        headers: response.headers,
        body: this.config.logResponseBody ? this.truncateBody(response.body) : undefined,
        timing: response.timing,
        size: response.body?.length || 0,
      },
    };

    await this.writeLog(entry);
    this.emit('response-logged', response);
  }

  private async writeLog(entry: LogEntry): Promise<void> {
    try {
      // Check if rotation needed
      await this.rotateIfNeeded();

      const logLine = JSON.stringify(entry) + '\n';
      this.logStream.write(logLine);
      this.fileSize += Buffer.byteLength(logLine);

      // Auto-flush if buffer is large
      if (this.fileSize > this.config.maxFileSize / 2) {
        await this.flush();
      }

    } catch (error) {
      logger.error('Failed to write log entry', { error, entryId: entry.id });
    }
  }

  private async rotateIfNeeded(): Promise<void> {
    let needsRotation = false;

    // Check file size
    if (this.fileSize >= this.config.maxFileSize) {
      needsRotation = true;
    }

    // Check daily rotation
    if (this.config.rotateDaily) {
      const currentDate = this.getCurrentDateString();
      if (currentDate !== this.currentDate) {
        needsRotation = true;
        this.currentDate = currentDate;
      }
    }

    if (needsRotation) {
      await this.rotateLog();
    }
  }

  private async rotateLog(): Promise<void> {
    await this.flush();
    
    // Close current stream
    this.logStream.end();
    
    // Compress old log
    if (this.config.compressLogs && fs.existsSync(this.currentLogFile)) {
      await this.compressLogFile(this.currentLogFile);
    }

    // Create new log file
    this.currentLogFile = this.generateLogFileName();
    this.logStream = this.createLogStream();
    this.fileSize = 0;

    logger.info('Log rotation completed', { newFile: this.currentLogFile });
  }

  private async compressLogFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const compressedPath = filePath + '.gz';
      const readStream = fs.createReadStream(filePath);
      const writeStream = fs.createWriteStream(compressedPath);
      const gzip = zlib.createGzip();

      readStream.pipe(gzip).pipe(writeStream);

      writeStream.on('finish', () => {
        fs.unlink(filePath, (err) => {
          if (err) {
            logger.error('Failed to delete original log file', { error: err });
          }
          resolve();
        });
      });

      writeStream.on('error', reject);
    });
  }

  async flush(): Promise<void> {
    return new Promise((resolve) => {
      this.logStream.write('', () => {
        resolve();
      });
    });
  }

  async getLogs(
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
      type?: 'request' | 'response';
    } = {}
  ): Promise<LogEntry[]> {
    const logs: LogEntry[] = [];
    const files = fs.readdirSync(this.config.logDir)
      .filter(file => file.startsWith('proxy-log-') && file.endsWith('.log'))
      .sort();

    for (const file of files) {
      const filePath = path.join(this.config.logDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const entry: LogEntry = JSON.parse(line);
          
          // Apply filters
          if (options.type && entry.type !== options.type) continue;
          if (options.startDate && new Date(entry.timestamp) < options.startDate) continue;
          if (options.endDate && new Date(entry.timestamp) > options.endDate) continue;

          logs.push(entry);
        } catch (error) {
          // Skip invalid JSON lines
        }
      }
    }

    // Sort by timestamp
    logs.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Apply pagination
    const start = options.offset || 0;
    const end = options.limit ? start + options.limit : undefined;

    return logs.slice(start, end);
  }

  async getStats(): Promise<any> {
    const stats = {
      totalRequests: 0,
      totalResponses: 0,
      averageResponseTime: 0,
      errorRate: 0,
      topEndpoints: new Map<string, number>(),
      topMethods: new Map<string, number>(),
    };

    const logs = await this.getLogs();

    const requests = logs.filter(log => log.type === 'request');
    const responses = logs.filter(log => log.type === 'response');

    stats.totalRequests = requests.length;
    stats.totalResponses = responses.length;

    // Analyze endpoints
    requests.forEach(log => {
      const url = log.data.url || '';
      const method = log.data.method || 'UNKNOWN';
      
      stats.topEndpoints.set(url, (stats.topEndpoints.get(url) || 0) + 1);
      stats.topMethods.set(method, (stats.topMethods.get(method) || 0) + 1);
    });

    // Calculate error rate
    const errors = responses.filter(log => log.data.statusCode >= 400);
    stats.errorRate = responses.length > 0 ? (errors.length / responses.length) * 100 : 0;

    return stats;
  }

  async clearOldLogs(daysToKeep: number = 30): Promise<void> {
    const files = fs.readdirSync(this.config.logDir)
      .filter(file => file.startsWith('proxy-log-'));
    
    const now = Date.now();
    const cutoff = now - (daysToKeep * 24 * 60 * 60 * 1000);

    for (const file of files) {
      const filePath = path.join(this.config.logDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        logger.info(`Deleted old log file: ${file}`);
      }
    }
  }

  async close(): Promise<void> {
    await this.flush();
    this.logStream.end();
  }
}