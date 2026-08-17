import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';
import { 
  MobileClientConfig, 
  SearchParams, 
  ProductSearchResponse, 
  ProductDetailResponse 
} from '../../types/mobile-api.types';
import { DeviceFingerprint } from './device-fingerprint';
import { AuthenticationManager } from './authentication';
import { MobileHeaderGenerator } from '../../utils/mobile-headers';

export class MobileApiClient {
  public deviceId: string;
  private client: AxiosInstance;
  private fingerprint: DeviceFingerprint;
  private authManager: AuthenticationManager;
  private headerGenerator: MobileHeaderGenerator;
  private baseUrl: string;
  private sessionToken: string | null = null;

  constructor(config: MobileClientConfig) {
    this.deviceId = config.deviceId;
    this.baseUrl = config.baseUrl || 'https://shopee.co.id/api/v4';
    
    this.fingerprint = new DeviceFingerprint(this.deviceId);
    this.authManager = new AuthenticationManager(config.authConfig);
    this.headerGenerator = new MobileHeaderGenerator(this.deviceId);
    
    // Create axios instance with base headers
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeout || 30000,
    });

    // Set headers directly on the instance
    const baseHeaders = this.headerGenerator.generateBaseHeaders();
    Object.entries(baseHeaders).forEach(([key, value]) => {
      if (value) {
        this.client.defaults.headers.common[key] = value;
      }
    });

    this.setupInterceptors();
    this.initializeSession();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(async (config) => {
      // Add mobile headers directly to config
      const mobileHeaders = this.headerGenerator.generateMobileHeaders();
      Object.entries(mobileHeaders).forEach(([key, value]) => {
        if (value && config.headers) {
          config.headers[key] = value;
        }
      });
      
      // Add fingerprint and session token
      if (config.headers) {
        config.headers['X-Device-Fingerprint'] = this.fingerprint.generate();
        config.headers['X-Session-Token'] = await this.authManager.getValidToken();
      }
      
      if (config.url?.includes('/product')) {
        config.params = {
          ...config.params,
          device_fingerprint: this.fingerprint.getHash(),
          client_type: 'mobile',
          version: '4.0.0',
        };
      }
      
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          await this.authManager.refreshToken();
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  private async initializeSession(): Promise<void> {
    try {
      this.sessionToken = await this.authManager.login();
      logger.info('Mobile session initialized', { deviceId: this.deviceId });
    } catch (error) {
      logger.error('Session initialization failed', { error, deviceId: this.deviceId });
      throw error;
    }
  }

  async searchProducts(params: SearchParams): Promise<ProductSearchResponse> {
    const response = await this.client.get('/product/search', {
      params: {
        ...params,
        limit: params.limit || 20,
        offset: params.offset || 0,
        sort: params.sort || 'popular',
      },
    });
    
    return response.data;
  }

  async getProductDetail(productId: string): Promise<ProductDetailResponse> {
    const response = await this.client.get(`/product/${productId}`, {
      params: {
        include: 'attributes,ratings,shop_info',
        device_fingerprint: this.fingerprint.getHash(),
      },
    });
    
    return response.data;
  }

  async getSessionToken(): Promise<string | null> {
    return this.sessionToken;
  }

  async refreshSession(): Promise<void> {
    this.sessionToken = await this.authManager.refreshToken();
    logger.info('Session refreshed', { deviceId: this.deviceId });
  }

  getDeviceInfo(): any {
    return {
      deviceId: this.deviceId,
      fingerprint: this.fingerprint.getHash(),
    };
  }
}

export default MobileApiClient;