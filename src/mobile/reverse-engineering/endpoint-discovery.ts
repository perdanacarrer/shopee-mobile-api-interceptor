import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { APKAnalyzer, APIEndpoint, NetworkCall } from './apk-analyzer';
import { MobileHeaderGenerator } from '../../utils/mobile-headers';
import { proxyUtils } from '../../utils/proxy-utils';
import axios, { AxiosInstance } from 'axios';

export interface EndpointDiscoveryConfig {
  baseUrl: string;
  analyzeStatic: boolean;
  analyzeDynamic: boolean;
  analyzeTraffic: boolean;
  testEndpoints: boolean;
  discoverParameters: boolean;
  discoverAuthentication: boolean;
  maxConcurrentRequests: number;
  requestTimeout: number;
  testSampleSize: number;
}

export interface DiscoveredEndpoint {
  path: string;
  method: string;
  fullUrl: string;
  parameters: ParameterDiscovery[];
  headers: HeaderDiscovery[];
  authentication: AuthenticationDiscovery;
  responseFormat: string;
  sampleResponses: any[];
  confidence: number;
  lastTested: Date;
  status: 'discovered' | 'tested' | 'validated' | 'working';
  notes: string[];
}

export interface ParameterDiscovery {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: any;
  possibleValues: any[];
  source: string;
  confidence: number;
}

export interface HeaderDiscovery {
  name: string;
  value: string;
  required: boolean;
  source: string;
  confidence: number;
}

export interface AuthenticationDiscovery {
  type: 'none' | 'bearer' | 'basic' | 'apiKey' | 'oauth' | 'session' | 'custom';
  header?: string;
  location: 'header' | 'query' | 'body' | 'cookie';
  required: boolean;
  source: string;
  confidence: number;
}

export class EndpointDiscovery extends EventEmitter {
  private config: EndpointDiscoveryConfig;
  private endpoints: Map<string, DiscoveredEndpoint> = new Map();
  private testedEndpoints: Set<string> = new Set();
  private client: AxiosInstance;
  private headerGenerator: MobileHeaderGenerator;

  constructor(config: Partial<EndpointDiscoveryConfig> = {}) {
    super();
    
    this.config = {
      baseUrl: config.baseUrl || 'https://shopee.co.id/api/v4',
      analyzeStatic: config.analyzeStatic ?? true,
      analyzeDynamic: config.analyzeDynamic ?? true,
      analyzeTraffic: config.analyzeTraffic ?? true,
      testEndpoints: config.testEndpoints ?? true,
      discoverParameters: config.discoverParameters ?? true,
      discoverAuthentication: config.discoverAuthentication ?? true,
      maxConcurrentRequests: config.maxConcurrentRequests || 10,
      requestTimeout: config.requestTimeout || 30000,
      testSampleSize: config.testSampleSize || 10,
    };

    this.headerGenerator = new MobileHeaderGenerator();
    this.client = axios.create({
      timeout: this.config.requestTimeout,
      headers: this.headerGenerator.generateMobileHeaders(),
    });
  }

  async discoverFromAPK(analyzer: APKAnalyzer): Promise<DiscoveredEndpoint[]> {
    logger.info('Discovering endpoints from APK analysis...');

    const endpoints: DiscoveredEndpoint[] = [];

    try {
      // Get endpoints from network calls
      const networkCalls = analyzer.getNetworkCalls();
      const apiEndpoints = analyzer.getEndpoints();

      // Process network calls
      for (const call of networkCalls) {
        const endpoint = this.processNetworkCall(call);
        if (endpoint) {
          endpoints.push(endpoint);
        }
      }

      // Process API endpoints
      for (const apiEndpoint of apiEndpoints) {
        const endpoint = this.processAPIEndpoint(apiEndpoint);
        if (endpoint) {
          endpoints.push(endpoint);
        }
      }

      // Deduplicate endpoints
      const uniqueEndpoints = this.deduplicateEndpoints(endpoints);

      // Store endpoints
      for (const endpoint of uniqueEndpoints) {
        this.endpoints.set(endpoint.path, endpoint);
      }

      this.emit('endpoints-discovered', uniqueEndpoints);
      logger.info(`Discovered ${uniqueEndpoints.length} unique endpoints`);

      return uniqueEndpoints;
    } catch (error) {
      logger.error('Endpoint discovery from APK failed', { error });
      throw error;
    }
  }

  private processNetworkCall(call: NetworkCall): DiscoveredEndpoint | null {
    try {
      const url = new URL(call.url);
      const path = url.pathname;
      
      // Skip non-API paths
      if (!path.includes('api') && !path.includes('v1') && !path.includes('v2') && 
          !path.includes('v3') && !path.includes('v4')) {
        return null;
      }

      // Check if it's a Shopee API endpoint
      if (!url.hostname.includes('shopee')) {
        return null;
      }

      const endpoint: DiscoveredEndpoint = {
        path,
        method: call.method,
        fullUrl: call.url,
        parameters: [],
        headers: [],
        authentication: {
          type: 'none',
          location: 'header',
          required: false,
          source: 'static',
          confidence: 0,
        },
        responseFormat: this.detectResponseFormat(call),
        sampleResponses: [],
        confidence: call.confidence,
        lastTested: new Date(),
        status: 'discovered',
        notes: [],
      };

      // Process parameters
      for (const param of call.parameters) {
        const paramDiscovery = this.processParameter(param);
        if (paramDiscovery) {
          endpoint.parameters.push(paramDiscovery);
        }
      }

      // Process headers
      for (const header of call.headers) {
        const headerDiscovery = this.processHeader(header);
        if (headerDiscovery) {
          endpoint.headers.push(headerDiscovery);
        }
      }

      // Detect authentication
      const auth = this.detectAuthentication(call);
      if (auth) {
        endpoint.authentication = auth;
      }

      endpoint.notes.push('Discovered from static APK analysis');

      return endpoint;
    } catch (error) {
      return null;
    }
  }

  private processAPIEndpoint(apiEndpoint: APIEndpoint): DiscoveredEndpoint | null {
    try {
      const endpoint: DiscoveredEndpoint = {
        path: apiEndpoint.path,
        method: apiEndpoint.method,
        fullUrl: `${apiEndpoint.baseUrl}${apiEndpoint.path}`,
        parameters: [],
        headers: [],
        authentication: {
          type: 'none',
          location: 'header',
          required: false,
          source: 'static',
          confidence: 0,
        },
        responseFormat: apiEndpoint.responseType,
        sampleResponses: [],
        confidence: apiEndpoint.confidence,
        lastTested: new Date(),
        status: 'discovered',
        notes: [],
      };

      // Process parameters
      for (const param of apiEndpoint.parameters) {
        const paramDiscovery = this.processParameter(param);
        if (paramDiscovery) {
          endpoint.parameters.push(paramDiscovery);
        }
      }

      // Process headers
      for (const header of apiEndpoint.headers) {
        const headerDiscovery = this.processHeader(header);
        if (headerDiscovery) {
          endpoint.headers.push(headerDiscovery);
        }
      }

      // Process authentication
      if (apiEndpoint.authentication.length > 0) {
        endpoint.authentication = {
          type: 'bearer',
          header: 'Authorization',
          location: 'header',
          required: true,
          source: 'static',
          confidence: 0.8,
        };
      }

      endpoint.notes.push('Discovered from API endpoint analysis');

      return endpoint;
    } catch (error) {
      return null;
    }
  }

  private processParameter(param: string): ParameterDiscovery | null {
    try {
      // Try to parse parameter
      const match = param.match(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/);
      if (match) {
        return {
          name: match[1],
          type: 'string',
          required: true,
          defaultValue: match[2],
          possibleValues: [match[2]],
          source: 'static',
          confidence: 0.7,
        };
      }

      const queryMatch = param.match(/\?([^&=\s]+)=([^&=\s]+)/);
      if (queryMatch) {
        return {
          name: queryMatch[1],
          type: 'string',
          required: true,
          defaultValue: queryMatch[2],
          possibleValues: [queryMatch[2]],
          source: 'static',
          confidence: 0.6,
        };
      }

      return {
        name: param.substring(0, 20),
        type: 'string',
        required: true,
        possibleValues: [],
        source: 'static',
        confidence: 0.3,
      };
    } catch (error) {
      return null;
    }
  }

  private processHeader(header: string): HeaderDiscovery | null {
    try {
      const match = header.match(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/);
      if (match) {
        return {
          name: match[1],
          value: match[2],
          required: true,
          source: 'static',
          confidence: 0.8,
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private detectAuthentication(call: NetworkCall): AuthenticationDiscovery | null {
    const authHeaders = call.headers.filter(h => 
      h.toLowerCase().includes('authorization') || 
      h.toLowerCase().includes('token') ||
      h.toLowerCase().includes('bearer')
    );

    if (authHeaders.length > 0) {
      const header = authHeaders[0];
      if (header.toLowerCase().includes('bearer')) {
        return {
          type: 'bearer',
          header: 'Authorization',
          location: 'header',
          required: true,
          source: 'static',
          confidence: 0.9,
        };
      }
      if (header.toLowerCase().includes('token')) {
        return {
          type: 'apiKey',
          header: 'X-API-Token',
          location: 'header',
          required: true,
          source: 'static',
          confidence: 0.7,
        };
      }
    }

    // Check for session tokens in parameters
    for (const param of call.parameters) {
      if (param.toLowerCase().includes('token') || 
          param.toLowerCase().includes('session')) {
        return {
          type: 'session',
          header: 'X-Session-Token',
          location: 'header',
          required: true,
          source: 'static',
          confidence: 0.6,
        };
      }
    }

    return {
      type: 'none',
      location: 'header',
      required: false,
      source: 'static',
      confidence: 0.3,
    };
  }

  private detectResponseFormat(call: NetworkCall): string {
    const url = call.url.toLowerCase();
    if (url.includes('.json')) return 'json';
    if (url.includes('.xml')) return 'xml';
    if (url.includes('.html')) return 'html';
    if (url.includes('.protobuf')) return 'protobuf';
    
    for (const header of call.headers) {
      if (header.includes('application/json')) return 'json';
      if (header.includes('application/xml')) return 'xml';
      if (header.includes('text/html')) return 'html';
      if (header.includes('application/protobuf')) return 'protobuf';
    }
    
    return 'json';
  }

  private deduplicateEndpoints(endpoints: DiscoveredEndpoint[]): DiscoveredEndpoint[] {
    const unique = new Map<string, DiscoveredEndpoint>();
    
    for (const endpoint of endpoints) {
      const key = `${endpoint.method}:${endpoint.path}`;
      
      if (!unique.has(key)) {
        unique.set(key, endpoint);
      } else {
        // Merge with existing endpoint
        const existing = unique.get(key)!;
        
        // Update confidence
        existing.confidence = Math.max(existing.confidence, endpoint.confidence);
        
        // Merge parameters
        for (const param of endpoint.parameters) {
          if (!existing.parameters.find(p => p.name === param.name)) {
            existing.parameters.push(param);
          }
        }
        
        // Merge headers
        for (const header of endpoint.headers) {
          if (!existing.headers.find(h => h.name === header.name)) {
            existing.headers.push(header);
          }
        }
        
        // Update notes
        if (endpoint.notes.length > 0) {
          existing.notes.push(...endpoint.notes);
        }
      }
    }
    
    return Array.from(unique.values());
  }

  async discoverFromTraffic(proxyLogs: any[]): Promise<DiscoveredEndpoint[]> {
    logger.info('Discovering endpoints from traffic logs...');

    const endpoints: DiscoveredEndpoint[] = [];

    for (const log of proxyLogs) {
      try {
        const url = new URL(log.url);
        const path = url.pathname;
        
        if (!path.includes('api')) continue;
        if (!url.hostname.includes('shopee')) continue;

        const endpoint: DiscoveredEndpoint = {
          path,
          method: log.method,
          fullUrl: log.url,
          parameters: [],
          headers: [],
          authentication: {
            type: 'none',
            location: 'header',
            required: false,
            source: 'traffic',
            confidence: 0,
          },
          responseFormat: 'json',
          sampleResponses: [log.response],
          confidence: 0.9,
          lastTested: new Date(),
          status: 'validated',
          notes: ['Discovered from live traffic'],
        };

        // Extract parameters from query string
        if (url.search) {
          const params = new URLSearchParams(url.search);
          for (const [key, value] of params) {
            endpoint.parameters.push({
              name: key,
              type: typeof value,
              required: true,
              defaultValue: value,
              possibleValues: [value],
              source: 'traffic',
              confidence: 0.9,
            });
          }
        }

        // Extract headers
        if (log.headers) {
          for (const [key, value] of Object.entries(log.headers)) {
            endpoint.headers.push({
              name: key,
              value: String(value),
              required: true,
              source: 'traffic',
              confidence: 0.8,
            });
          }
        }

        endpoints.push(endpoint);
      } catch (error) {
        // Skip invalid entries
      }
    }

    // Deduplicate endpoints
    const uniqueEndpoints = this.deduplicateEndpoints(endpoints);
    
    // Store endpoints
    for (const endpoint of uniqueEndpoints) {
      const key = `${endpoint.method}:${endpoint.path}`;
      if (!this.endpoints.has(key)) {
        this.endpoints.set(key, endpoint);
      }
    }

    this.emit('traffic-endpoints-discovered', uniqueEndpoints);
    logger.info(`Discovered ${uniqueEndpoints.length} endpoints from traffic`);

    return uniqueEndpoints;
  }

  async testEndpoints(token?: string): Promise<Map<string, any>> {
    logger.info('Testing discovered endpoints...');

    const results = new Map<string, any>();

    // Filter endpoints to test
    const toTest = Array.from(this.endpoints.values())
      .filter(e => !this.testedEndpoints.has(`${e.method}:${e.path}`))
      .slice(0, this.config.testSampleSize);

    if (toTest.length === 0) {
      logger.info('No endpoints to test');
      return results;
    }

    // Test endpoints in parallel with concurrency limit
    const chunks = this.chunkArray(toTest, this.config.maxConcurrentRequests);
    
    for (const chunk of chunks) {
      const promises = chunk.map(endpoint => 
        this.testSingleEndpoint(endpoint, token)
      );
      
      const chunkResults = await Promise.all(promises);
      
      for (const result of chunkResults) {
        if (result) {
          results.set(result.key, result);
          this.testedEndpoints.add(result.key);
        }
      }
    }

    this.emit('endpoints-tested', results);
    logger.info(`Tested ${results.size} endpoints`);

    return results;
  }

  private async testSingleEndpoint(
    endpoint: DiscoveredEndpoint, 
    token?: string
  ): Promise<any> {
    try {
      const url = endpoint.fullUrl;
      const headers = this.prepareHeaders(endpoint, token);
      
      let response;
      
      switch (endpoint.method.toUpperCase()) {
        case 'GET':
          response = await this.client.get(url, { headers });
          break;
        case 'POST':
          response = await this.client.post(url, {}, { headers });
          break;
        case 'PUT':
          response = await this.client.put(url, {}, { headers });
          break;
        case 'DELETE':
          response = await this.client.delete(url, { headers });
          break;
        default:
          response = await this.client.get(url, { headers });
      }

      const result = {
        key: `${endpoint.method}:${endpoint.path}`,
        endpoint,
        response: {
          status: response.status,
          data: response.data,
          headers: response.headers,
        },
        timestamp: new Date(),
        success: response.status >= 200 && response.status < 400,
      };

      // Update endpoint with response sample
      endpoint.sampleResponses.push(response.data);
      endpoint.status = result.success ? 'working' : 'tested';
      endpoint.lastTested = new Date();
      endpoint.confidence = Math.min(1, endpoint.confidence + 0.1);

      this.endpoints.set(endpoint.path, endpoint);

      return result;
    } catch (error: any) {
      const result = {
        key: `${endpoint.method}:${endpoint.path}`,
        endpoint,
        error: error.message,
        timestamp: new Date(),
        success: false,
      };

      endpoint.status = 'tested';
      endpoint.lastTested = new Date();
      endpoint.confidence = Math.max(0, endpoint.confidence - 0.1);

      return result;
    }
  }

  private prepareHeaders(endpoint: DiscoveredEndpoint, token?: string): any {
    const headers: any = {
      'User-Agent': this.headerGenerator.generateMobileHeaders()['User-Agent'],
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    // Add endpoint-specific headers
    for (const header of endpoint.headers) {
      if (header.name.toLowerCase() !== 'authorization') {
        headers[header.name] = header.value;
      }
    }

    // Add authentication if token provided
    if (token && endpoint.authentication.type !== 'none') {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add common Shopee headers
    headers['X-Platform'] = 'android';
    headers['X-Device-ID'] = this.headerGenerator.getDeviceInfo().deviceId;

    return headers;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async discoverAuthenticationPatterns(): Promise<any> {
    logger.info('Discovering authentication patterns...');

    const patterns = {
      bearer: false,
      basic: false,
      apiKey: false,
      session: false,
      oauth: false,
      custom: false,
    };

    for (const endpoint of this.endpoints.values()) {
      const auth = endpoint.authentication;
      
      if (auth.type === 'bearer') patterns.bearer = true;
      if (auth.type === 'basic') patterns.basic = true;
      if (auth.type === 'apiKey') patterns.apiKey = true;
      if (auth.type === 'session') patterns.session = true;
      if (auth.type === 'oauth') patterns.oauth = true;
      if (auth.type === 'custom') patterns.custom = true;
    }

    return patterns;
  }

  getEndpoints(): DiscoveredEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  getEndpoint(path: string): DiscoveredEndpoint | null {
    return this.endpoints.get(path) || null;
  }

  getEndpointByMethod(method: string): DiscoveredEndpoint[] {
    return Array.from(this.endpoints.values())
      .filter(e => e.method === method);
  }

  getEndpointsByStatus(status: DiscoveredEndpoint['status']): DiscoveredEndpoint[] {
    return Array.from(this.endpoints.values())
      .filter(e => e.status === status);
  }

  getHighConfidenceEndpoints(threshold: number = 0.8): DiscoveredEndpoint[] {
    return Array.from(this.endpoints.values())
      .filter(e => e.confidence >= threshold);
  }

  exportEndpoints(): any {
    return {
      total: this.endpoints.size,
      endpoints: Array.from(this.endpoints.values()).map(e => ({
        path: e.path,
        method: e.method,
        fullUrl: e.fullUrl,
        confidence: e.confidence,
        status: e.status,
        parameters: e.parameters,
        authentication: e.authentication,
        responseFormat: e.responseFormat,
        notes: e.notes,
      })),
    };
  }

  clear(): void {
    this.endpoints.clear();
    this.testedEndpoints.clear();
    logger.info('Endpoints cleared');
  }
}

export default EndpointDiscovery;