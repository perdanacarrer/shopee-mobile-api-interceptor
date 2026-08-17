import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { RequestLogger } from './request-logger';
import { PatternAnalyzer } from './pattern-analyzer';

export interface ProxyConfig {
  port: number;
  host: string;
  ssl: {
    key: string;
    cert: string;
    ca: string;
  };
  enableInterception: boolean;
  filterDomains: string[];
}

export interface InterceptedRequest {
  id: string;
  timestamp: Date;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
  query: Record<string, string>;
}

export interface InterceptedResponse {
  id: string;
  timestamp: Date;
  statusCode: number;
  headers: Record<string, string>;
  body?: Buffer;
}

export class MITMProxyServer extends EventEmitter {
  private httpServer: http.Server | null = null;
  private httpsServer: https.Server | null = null;
  private config: ProxyConfig;
  private requestLogger: RequestLogger;
  private patternAnalyzer: PatternAnalyzer;
  private requestMap: Map<string, InterceptedRequest> = new Map();
  private activeConnections: Set<net.Socket> = new Set();
  private isRunning: boolean = false;

  constructor(config: Partial<ProxyConfig> = {}) {
    super();
    
    this.config = {
      port: 8080,
      host: '0.0.0.0',
      ssl: {
        key: '',
        cert: '',
        ca: '',
      },
      enableInterception: true,
      filterDomains: ['shopee.co.id', 'shopee.com', 'shopee.sg'],
      ...config,
    };

    this.requestLogger = new RequestLogger({
      logDir: './logs/proxy',
      maxFileSize: 10 * 1024 * 1024,
      rotateDaily: true,
    });

    this.patternAnalyzer = new PatternAnalyzer({
      minOccurrences: 3,
      confidenceThreshold: 0.8,
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // HTTP Server
        this.httpServer = http.createServer((req, res) => {
          this.handleRequest(req, res);
        });

        this.httpServer.on('connect', (req, clientSocket, head) => {
          // Cast clientSocket to net.Socket
          this.handleConnect(req, clientSocket as net.Socket, head);
        });

        this.httpServer.listen(this.config.port, this.config.host, () => {
          this.isRunning = true;
          logger.info(`HTTP Proxy started on ${this.config.host}:${this.config.port}`);
          resolve();
        });

        // HTTPS Server
        if (this.config.ssl.key && this.config.ssl.cert) {
          const httpsOptions = {
            key: fs.readFileSync(this.config.ssl.key),
            cert: fs.readFileSync(this.config.ssl.cert),
            ca: fs.readFileSync(this.config.ssl.ca),
            rejectUnauthorized: false,
          };

          this.httpsServer = https.createServer(httpsOptions, (req, res) => {
            this.handleRequest(req, res);
          });

          this.httpsServer.listen(this.config.port + 1, this.config.host, () => {
            logger.info(`HTTPS Proxy started on ${this.config.host}:${this.config.port + 1}`);
          });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const requestId = this.generateRequestId();
    const parsedUrl = url.parse(req.url || '', true);
    
    // Check if socket has encrypted property (HTTPS)
    const isHttps = (req.socket as any).encrypted || false;

    const interceptedReq: InterceptedRequest = {
      id: requestId,
      timestamp: new Date(),
      method: req.method || 'GET',
      url: req.url || '',
      headers: this.normalizeHeaders(req.headers),
      query: parsedUrl.query as Record<string, string>,
    };

    const bodyChunks: Buffer[] = [];
    req.on('data', (chunk) => {
      bodyChunks.push(chunk);
    });

    req.on('end', async () => {
      if (bodyChunks.length > 0) {
        interceptedReq.body = Buffer.concat(bodyChunks);
      }

      this.requestMap.set(requestId, interceptedReq);
      this.emit('request', interceptedReq);

      await this.requestLogger.logRequest(interceptedReq);

      const hostname = parsedUrl.hostname || req.headers.host?.split(':')[0] || '';
      const shouldIntercept = this.shouldInterceptDomain(hostname);

      if (shouldIntercept && this.config.enableInterception) {
        this.patternAnalyzer.analyzeRequest(interceptedReq);
        await this.interceptRequest(interceptedReq, res);
      } else {
        await this.forwardRequest(interceptedReq, res);
      }
    });
  }

  private handleConnect(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
    const [host, port] = (req.url || '').split(':');
    const serverSocket = net.connect(parseInt(port) || 443, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      
      if (this.config.enableInterception) {
        this.interceptTLSConnection(clientSocket, serverSocket, host);
      } else {
        clientSocket.pipe(serverSocket);
        serverSocket.pipe(clientSocket);
      }
    });

    serverSocket.on('error', (err) => {
      logger.error('Proxy connection error', { error: err, host });
      clientSocket.destroy();
    });

    this.activeConnections.add(clientSocket);
    clientSocket.on('close', () => {
      this.activeConnections.delete(clientSocket);
    });
  }

  private interceptTLSConnection(
    clientSocket: net.Socket,
    serverSocket: net.Socket,
    host: string
  ): void {
    const tls = require('tls');
    const tlsOptions = {
      host: host,
      port: 443,
      rejectUnauthorized: false,
      servername: host,
    };

    const tlsSocket = tls.connect(tlsOptions, () => {
      clientSocket.pipe(tlsSocket);
      tlsSocket.pipe(clientSocket);
      logger.debug('TLS interception established', { host });
    });

    tlsSocket.on('error', (err: Error) => {
      logger.error('TLS interception error', { error: err, host });
      clientSocket.destroy();
    });
  }

  private async interceptRequest(
    req: InterceptedRequest,
    res: http.ServerResponse
  ): Promise<void> {
    const parsedUrl = url.parse(req.url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.path,
      method: req.method,
      headers: {
        ...req.headers,
        'Accept-Encoding': 'identity',
      },
    };

    const targetReq = https.request(options, (targetRes) => {
      const responseChunks: Buffer[] = [];
      
      targetRes.on('data', (chunk) => {
        responseChunks.push(chunk);
      });

      targetRes.on('end', async () => {
        const interceptedRes: InterceptedResponse = {
          id: req.id,
          timestamp: new Date(),
          statusCode: targetRes.statusCode || 200,
          headers: this.normalizeHeaders(targetRes.headers),
        };

        if (responseChunks.length > 0) {
          interceptedRes.body = Buffer.concat(responseChunks);
        }

        this.emit('response', interceptedRes);
        await this.requestLogger.logResponse(interceptedRes);
        this.patternAnalyzer.analyzeResponse(interceptedRes);

        res.writeHead(interceptedRes.statusCode, interceptedRes.headers);
        if (interceptedRes.body) {
          res.write(interceptedRes.body);
        }
        res.end();
      });
    });

    if (req.body) {
      targetReq.write(req.body);
    }
    targetReq.end();

    targetReq.on('error', (err) => {
      logger.error('Target request error', { error: err, url: req.url });
      res.writeHead(500);
      res.end('Proxy error');
    });
  }

  private async forwardRequest(
    req: InterceptedRequest,
    res: http.ServerResponse
  ): Promise<void> {
    const parsedUrl = url.parse(req.url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.path,
      method: req.method,
      headers: req.headers,
    };

    const targetReq = https.request(options, (targetRes) => {
      const chunks: Buffer[] = [];
      
      targetRes.on('data', (chunk) => {
        chunks.push(chunk);
      });

      targetRes.on('end', () => {
        const body = Buffer.concat(chunks);
        res.writeHead(targetRes.statusCode || 200, targetRes.headers);
        res.write(body);
        res.end();
      });
    });

    if (req.body) {
      targetReq.write(req.body);
    }
    targetReq.end();

    targetReq.on('error', (err) => {
      logger.error('Forwarding error', { error: err, url: req.url });
      res.writeHead(500);
      res.end('Proxy error');
    });
  }

  private shouldInterceptDomain(hostname: string): boolean {
    return this.config.filterDomains.some(domain => 
      hostname.includes(domain)
    );
  }

  private normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
    const normalized: Record<string, string> = {};
    Object.entries(headers).forEach(([key, value]) => {
      if (value) {
        normalized[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    });
    return normalized;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.isRunning = false;
      
      this.activeConnections.forEach(socket => {
        socket.destroy();
      });
      this.activeConnections.clear();

      if (this.httpServer) {
        this.httpServer.close(() => {
          if (this.httpsServer) {
            this.httpsServer.close(() => {
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  getRequest(id: string): InterceptedRequest | undefined {
    return this.requestMap.get(id);
  }

  getAllRequests(): InterceptedRequest[] {
    return Array.from(this.requestMap.values());
  }

  clearRequests(): void {
    this.requestMap.clear();
  }
}

export default MITMProxyServer;