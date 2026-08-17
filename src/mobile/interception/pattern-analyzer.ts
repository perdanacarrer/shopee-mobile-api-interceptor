import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

export interface PatternAnalyzerConfig {
  minOccurrences: number;
  confidenceThreshold: number;
  ignoreStaticValues: boolean;
  maxPatternLength: number;
}

export interface APIPattern {
  endpoint: string;
  method: string;
  params: Record<string, PatternInfo>;
  headers: Record<string, PatternInfo>;
  bodyStructure: any;
  responseStructure: any;
  frequency: number;
  confidence: number;
  lastSeen: Date;
}

export interface PatternInfo {
  values: Set<string>;
  type: string;
  occurrence: number;
  isStatic: boolean;
  pattern: string;
}

export class PatternAnalyzer extends EventEmitter {
  private config: PatternAnalyzerConfig;
  private patterns: Map<string, APIPattern> = new Map();
  private requestCount: number = 0;
  private analyzedRequests: number = 0;

  constructor(config: Partial<PatternAnalyzerConfig> = {}) {
    super();
    
    this.config = {
      minOccurrences: 3,
      confidenceThreshold: 0.8,
      ignoreStaticValues: true,
      maxPatternLength: 100,
      ...config,
    };
  }

  analyzeRequest(request: any): void {
    const endpoint = this.extractEndpoint(request.url);
    const key = `${request.method}:${endpoint}`;
    this.requestCount++;

    let pattern = this.patterns.get(key);
    if (!pattern) {
      pattern = this.createNewPattern(request, endpoint);
      this.patterns.set(key, pattern);
    }

    this.updatePattern(pattern, request);
    this.analyzedRequests++;

    if (pattern.frequency >= this.config.minOccurrences) {
      this.emit('pattern-identified', pattern);
      logger.debug('Pattern identified', { endpoint: pattern.endpoint, frequency: pattern.frequency });
    }
  }

  analyzeResponse(response: any): void {
    const patterns = Array.from(this.patterns.values());
    for (const pattern of patterns) {
      if (pattern.frequency >= this.config.minOccurrences) {
        if (response.body) {
          try {
            const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
            pattern.responseStructure = this.analyzeStructure(body, pattern.responseStructure);
            pattern.confidence = this.calculateConfidence(pattern);
          } catch (error) {
            // Not JSON, skip
          }
        }
      }
    }
  }

  private createNewPattern(request: any, endpoint: string): APIPattern {
    return {
      endpoint,
      method: request.method,
      params: {},
      headers: {},
      bodyStructure: null,
      responseStructure: null,
      frequency: 0,
      confidence: 0,
      lastSeen: new Date(),
    };
  }

  private updatePattern(pattern: APIPattern, request: any): void {
    pattern.frequency++;
    pattern.lastSeen = new Date();

    if (request.query) {
      for (const [key, value] of Object.entries(request.query)) {
        if (!pattern.params[key]) {
          pattern.params[key] = {
            values: new Set(),
            type: 'string',
            occurrence: 0,
            isStatic: false,
            pattern: '',
          };
        }
        const paramInfo = pattern.params[key];
        paramInfo.values.add(String(value));
        paramInfo.occurrence++;
        paramInfo.type = this.detectType(value);
        paramInfo.isStatic = paramInfo.values.size === 1 && paramInfo.occurrence > 1;
        paramInfo.pattern = this.inferPattern(paramInfo.values);
      }
    }

    if (request.headers) {
      const relevantHeaders = ['user-agent', 'authorization', 'x-device-fingerprint', 'content-type'];
      for (const key of relevantHeaders) {
        const value = request.headers[key] || request.headers[key.toLowerCase()];
        if (value) {
          if (!pattern.headers[key]) {
            pattern.headers[key] = {
              values: new Set(),
              type: 'string',
              occurrence: 0,
              isStatic: false,
              pattern: '',
            };
          }
          const headerInfo = pattern.headers[key];
          headerInfo.values.add(String(value));
          headerInfo.occurrence++;
          headerInfo.type = this.detectType(value);
          headerInfo.isStatic = headerInfo.values.size === 1 && headerInfo.occurrence > 1;
          headerInfo.pattern = this.inferPattern(headerInfo.values);
        }
      }
    }

    if (request.body) {
      try {
        const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
        pattern.bodyStructure = this.analyzeStructure(body, pattern.bodyStructure);
      } catch (error) {
        // Not JSON, skip
      }
    }

    pattern.confidence = this.calculateConfidence(pattern);
  }

  private extractEndpoint(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.pathname;
    } catch {
      const match = url.match(/^([^?#]*)/);
      return match ? match[1] : url;
    }
  }

  private analyzeStructure(data: any, existing: any = null): any {
    if (typeof data !== 'object' || data === null) {
      return {
        type: typeof data,
        values: new Set([String(data)]),
        occurrence: 1,
      };
    }

    const structure: any = {};
    
    if (Array.isArray(data)) {
      structure.type = 'array';
      structure.length = data.length;
      structure.items = data.length > 0 ? this.analyzeStructure(data[0]) : null;
      return structure;
    }

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        structure[key] = this.analyzeStructure(value);
      } else {
        structure[key] = {
          type: typeof value,
          values: new Set([String(value)]),
          occurrence: 1,
        };
      }
    }

    if (existing) {
      for (const [key, value] of Object.entries(existing)) {
        if (structure[key]) {
          if (structure[key].values) {
            // Safely iterate over values
            const valueObj = value as any;
            if (valueObj.values) {
              for (const val of Array.from(valueObj.values)) {
                structure[key].values.add(val);
              }
            }
            structure[key].occurrence = (structure[key].occurrence || 0) + 1;
          }
        } else {
          structure[key] = value;
        }
      }
    }

    return structure;
  }

  private detectType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return 'integer';
      return 'float';
    }
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
      if (/^[a-fA-F0-9]{32}$/.test(value)) return 'md5';
      if (/^[a-fA-F0-9]{40}$/.test(value)) return 'sha1';
      if (/^[a-fA-F0-9]{64}$/.test(value)) return 'sha256';
      if (/^[a-fA-F0-9-]{36}$/.test(value)) return 'uuid';
      return 'string';
    }
    return typeof value;
  }

  private inferPattern(values: Set<string>): string {
    if (values.size === 0) return '';
    if (values.size === 1) return Array.from(values)[0];
    
    const allNumbers = Array.from(values).every(v => !isNaN(Number(v)));
    if (allNumbers) {
      const nums = Array.from(values).map(v => Number(v));
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      return `number:${min}-${max}`;
    }

    const examples = Array.from(values).slice(0, 5);
    if (examples.every(v => /^[a-zA-Z0-9]+$/.test(v))) {
      const lengths = examples.map(v => v.length);
      if (new Set(lengths).size === 1) {
        return `alphanumeric:${lengths[0]}`;
      }
    }

    try {
      const regex = this.generateRegex(Array.from(values));
      if (regex) return regex.toString();
    } catch {
      // Fallback to simple pattern
    }

    return `enum:${values.size}`;
  }

  private generateRegex(values: string[]): RegExp | null {
    if (values.every(v => /^\d+$/.test(v))) {
      return /^\d+$/;
    }
    if (values.every(v => /^[a-zA-Z]+$/.test(v))) {
      return /^[a-zA-Z]+$/;
    }
    if (values.every(v => /^[a-zA-Z0-9]+$/.test(v))) {
      return /^[a-zA-Z0-9]+$/;
    }
    return null;
  }

  private calculateConfidence(pattern: APIPattern): number {
    let confidence = 0;
    let factors = 0;

    if (pattern.frequency >= this.config.minOccurrences) {
      confidence += 0.3;
    }
    factors += 0.3;

    const consistentParams = Object.values(pattern.params).filter(p => p.isStatic).length;
    const totalParams = Object.values(pattern.params).length;
    if (totalParams > 0) {
      const paramRatio = consistentParams / totalParams;
      confidence += paramRatio * 0.3;
    }
    factors += 0.3;

    const consistentHeaders = Object.values(pattern.headers).filter(h => h.isStatic).length;
    const totalHeaders = Object.values(pattern.headers).length;
    if (totalHeaders > 0) {
      const headerRatio = consistentHeaders / totalHeaders;
      confidence += headerRatio * 0.2;
    }
    factors += 0.2;

    if (pattern.bodyStructure) {
      confidence += 0.2;
    }
    factors += 0.2;

    return factors > 0 ? confidence / factors : 0;
  }

  getPatterns(): APIPattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.frequency >= this.config.minOccurrences)
      .sort((a, b) => b.frequency - a.frequency);
  }

  getHighConfidencePatterns(minConfidence: number = 0.8): APIPattern[] {
    return this.getPatterns()
      .filter(p => p.confidence >= minConfidence);
  }

  getEndpointPatterns(endpoint: string): APIPattern[] {
    return this.getPatterns()
      .filter(p => p.endpoint.includes(endpoint));
  }

  exportPatterns(): any {
    return {
      totalRequests: this.requestCount,
      analyzedRequests: this.analyzedRequests,
      patterns: this.getPatterns().map(p => ({
        ...p,
        params: Object.fromEntries(
          Object.entries(p.params).map(([key, value]) => [
            key,
            {
              ...value,
              values: Array.from(value.values),
            }
          ])
        ),
        headers: Object.fromEntries(
          Object.entries(p.headers).map(([key, value]) => [
            key,
            {
              ...value,
              values: Array.from(value.values),
            }
          ])
        ),
      })),
    };
  }

  clear(): void {
    this.patterns.clear();
    this.analyzedRequests = 0;
    this.requestCount = 0;
  }

  getStats(): any {
    const patterns = this.getPatterns();
    return {
      totalPatterns: patterns.length,
      highConfidencePatterns: patterns.filter(p => p.confidence >= 0.8).length,
      averageConfidence: patterns.length > 0 
        ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length 
        : 0,
      topEndpoints: patterns
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10)
        .map(p => ({
          endpoint: p.endpoint,
          method: p.method,
          frequency: p.frequency,
          confidence: p.confidence,
        })),
    };
  }
}

export default PatternAnalyzer;