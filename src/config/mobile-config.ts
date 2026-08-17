import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.mobile') });

export interface MobileConfig {
  // API Configuration
  api: {
    baseUrl: string;
    version: string;
    timeout: number;
    retries: number;
    retryDelay: number;
  };
  
  // Device Configuration
  device: {
    defaultModel: string;
    defaultAndroidVersion: string;
    defaultAppVersion: string;
    minDevices: number;
    maxDevices: number;
  };
  
  // Proxy Configuration
  proxy: {
    enabled: boolean;
    host: string;
    port: number;
    protocol: 'http' | 'https' | 'socks5';
    username?: string;
    password?: string;
    rotateInterval: number;
    healthCheckInterval: number;
  };
  
  // Authentication Configuration
  auth: {
    tokenRefreshThreshold: number;
    maxSessionAge: number;
    maxUsesPerSession: number;
    accountPoolSize: number;
  };
  
  // Scaling Configuration
  scaling: {
    maxConcurrentRequests: number;
    loadBalancingStrategy: 'round-robin' | 'least-busy' | 'weighted' | 'random';
    circuitBreakerThreshold: number;
    healthCheckInterval: number;
  };
  
  // Cache Configuration
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
    redisUrl?: string;
  };
  
  // Logging Configuration
  logging: {
    level: string;
    filePath: string;
    maxFileSize: number;
    maxFiles: number;
  };
  
  // Monitoring Configuration
  monitoring: {
    enabled: boolean;
    interval: number;
    metricsEndpoint: string;
  };
  
  // Shopee-specific Configuration
  shopee: {
    domain: string;
    appPackage: string;
    appName: string;
    supportedCountries: string[];
    defaultCountry: string;
    defaultCurrency: string;
    defaultLanguage: string;
  };
  
  // Security Configuration
  security: {
    encryptionEnabled: boolean;
    sslBypassEnabled: boolean;
    certificatePinningBypass: boolean;
    rootDetectionBypass: boolean;
  };
}

export class MobileConfigManager {
  private static instance: MobileConfigManager;
  private config: MobileConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): MobileConfigManager {
    if (!MobileConfigManager.instance) {
      MobileConfigManager.instance = new MobileConfigManager();
    }
    return MobileConfigManager.instance;
  }

  private loadConfig(): MobileConfig {
    return {
      api: {
        baseUrl: process.env.SHOPEE_MOBILE_BASE_URL || 'https://shopee.co.id/api/v4',
        version: process.env.SHOPEE_MOBILE_API_VERSION || '4.0.0',
        timeout: parseInt(process.env.API_TIMEOUT || '30000'),
        retries: parseInt(process.env.API_RETRIES || '3'),
        retryDelay: parseInt(process.env.API_RETRY_DELAY || '1000'),
      },
      
      device: {
        defaultModel: process.env.DEFAULT_DEVICE_MODEL || 'SM-G998B',
        defaultAndroidVersion: process.env.DEFAULT_ANDROID_VERSION || '12',
        defaultAppVersion: process.env.DEFAULT_APP_VERSION || '4.0.0',
        minDevices: parseInt(process.env.MIN_DEVICES || '5'),
        maxDevices: parseInt(process.env.MAX_DEVICES || '50'),
      },
      
      proxy: {
        enabled: process.env.PROXY_ENABLED === 'true',
        host: process.env.PROXY_HOST || 'localhost',
        port: parseInt(process.env.PROXY_PORT || '8080'),
        protocol: (process.env.PROXY_PROTOCOL as 'http' | 'https' | 'socks5') || 'http',
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD,
        rotateInterval: parseInt(process.env.PROXY_ROTATE_INTERVAL || '300'),
        healthCheckInterval: parseInt(process.env.PROXY_HEALTH_CHECK_INTERVAL || '60'),
      },
      
      auth: {
        tokenRefreshThreshold: parseInt(process.env.TOKEN_REFRESH_THRESHOLD || '300'),
        maxSessionAge: parseInt(process.env.MAX_SESSION_AGE || '86400'),
        maxUsesPerSession: parseInt(process.env.MAX_USES_PER_SESSION || '1000'),
        accountPoolSize: parseInt(process.env.ACCOUNT_POOL_SIZE || '20'),
      },
      
      scaling: {
        maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '100'),
        loadBalancingStrategy: (process.env.LOAD_BALANCING_STRATEGY as any) || 'least-busy',
        circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5'),
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30'),
      },
      
      cache: {
        enabled: process.env.CACHE_ENABLED === 'true',
        ttl: parseInt(process.env.CACHE_TTL || '300'),
        maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000'),
        redisUrl: process.env.REDIS_URL,
      },
      
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        filePath: process.env.LOG_FILE_PATH || './logs/mobile.log',
        maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE || '50'),
        maxFiles: parseInt(process.env.LOG_MAX_FILES || '10'),
      },
      
      monitoring: {
        enabled: process.env.MONITORING_ENABLED === 'true',
        interval: parseInt(process.env.MONITORING_INTERVAL || '60'),
        metricsEndpoint: process.env.METRICS_ENDPOINT || '/metrics',
      },
      
      shopee: {
        domain: process.env.SHOPEE_DOMAIN || 'shopee.co.id',
        appPackage: process.env.SHOPEE_APP_PACKAGE || 'com.shopee.id',
        appName: process.env.SHOPEE_APP_NAME || 'Shopee Indonesia',
        supportedCountries: (process.env.SHOPEE_SUPPORTED_COUNTRIES || 'ID,TH,VN,SG,MY,PH,TW').split(','),
        defaultCountry: process.env.SHOPEE_DEFAULT_COUNTRY || 'ID',
        defaultCurrency: process.env.SHOPEE_DEFAULT_CURRENCY || 'IDR',
        defaultLanguage: process.env.SHOPEE_DEFAULT_LANGUAGE || 'en-US',
      },
      
      security: {
        encryptionEnabled: process.env.ENCRYPTION_ENABLED === 'true',
        sslBypassEnabled: process.env.SSL_BYPASS_ENABLED === 'true',
        certificatePinningBypass: process.env.CERTIFICATE_PINNING_BYPASS === 'true',
        rootDetectionBypass: process.env.ROOT_DETECTION_BYPASS === 'true',
      },
    };
  }

  public getConfig(): MobileConfig {
    return this.config;
  }

  public getApiConfig(): MobileConfig['api'] {
    return this.config.api;
  }

  public getDeviceConfig(): MobileConfig['device'] {
    return this.config.device;
  }

  public getProxyConfig(): MobileConfig['proxy'] {
    return this.config.proxy;
  }

  public getAuthConfig(): MobileConfig['auth'] {
    return this.config.auth;
  }

  public getScalingConfig(): MobileConfig['scaling'] {
    return this.config.scaling;
  }

  public getCacheConfig(): MobileConfig['cache'] {
    return this.config.cache;
  }

  public getLoggingConfig(): MobileConfig['logging'] {
    return this.config.logging;
  }

  public getMonitoringConfig(): MobileConfig['monitoring'] {
    return this.config.monitoring;
  }

  public getShopeeConfig(): MobileConfig['shopee'] {
    return this.config.shopee;
  }

  public getSecurityConfig(): MobileConfig['security'] {
    return this.config.security;
  }

  public updateConfig(updates: Partial<MobileConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };
  }

  public getConfigForCountry(countryCode: string): Partial<MobileConfig> {
    const shopeeConfig = this.config.shopee;
    const countryUpper = countryCode.toUpperCase();
    
    if (!shopeeConfig.supportedCountries.includes(countryUpper)) {
      throw new Error(`Unsupported country: ${countryCode}`);
    }
    
    const currencyMap: Record<string, string> = {
      'ID': 'IDR',
      'TH': 'THB',
      'VN': 'VND',
      'SG': 'SGD',
      'MY': 'MYR',
      'PH': 'PHP',
      'TW': 'TWD',
    };
    
    const languageMap: Record<string, string> = {
      'ID': 'id-ID',
      'TH': 'th-TH',
      'VN': 'vi-VN',
      'SG': 'en-SG',
      'MY': 'ms-MY',
      'PH': 'en-PH',
      'TW': 'zh-TW',
    };
    
    return {
      shopee: {
        ...shopeeConfig,
        defaultCountry: countryUpper,
        defaultCurrency: currencyMap[countryUpper] || 'USD',
        defaultLanguage: languageMap[countryUpper] || 'en-US',
      },
      api: {
        ...this.config.api,
        baseUrl: `https://${shopeeConfig.domain}/api/v4`,
      },
    };
  }

  public validateConfig(): boolean {
    try {
      const config = this.config;
      
      // Validate required fields
      if (!config.api.baseUrl) {
        throw new Error('API base URL is required');
      }
      
      if (config.device.minDevices > config.device.maxDevices) {
        throw new Error('Min devices cannot be greater than max devices');
      }
      
      if (config.scaling.maxConcurrentRequests < 1) {
        throw new Error('Max concurrent requests must be at least 1');
      }
      
      // Validate proxy configuration
      if (config.proxy.enabled) {
        if (!config.proxy.host || !config.proxy.port) {
          throw new Error('Proxy host and port are required when proxy is enabled');
        }
      }
      
      return true;
    } catch (error) {
      console.error('Configuration validation failed:', error);
      return false;
    }
  }

  public getEnvironment(): string {
    return process.env.NODE_ENV || 'development';
  }

  public isProduction(): boolean {
    return this.getEnvironment() === 'production';
  }

  public isDevelopment(): boolean {
    return this.getEnvironment() === 'development';
  }
}

// Export singleton instance
export const mobileConfig = MobileConfigManager.getInstance();

// Default export
export default mobileConfig;