import axios, { AxiosInstance, AxiosHeaders } from 'axios';
import { logger } from '../../utils/logger';
import { 
  MobileClientConfig, 
  SearchParams, 
  ProductSearchResponse, 
  ProductDetailResponse 
} from '../../types/mobile-api.types';

export class MobileApiClient {
  public deviceId: string;
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(config: MobileClientConfig) {
    this.deviceId = config.deviceId;
    this.baseUrl = config.baseUrl || 'https://shopee.co.id/api/v4';
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeout || 30000,
      headers: this.generateBaseHeaders(),
    });

    this.setupInterceptors();
  }

  private generateBaseHeaders(): any {
    return {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      'X-Platform': 'android',
      'X-Device-ID': this.deviceId,
    };
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use((config) => {
      const headers = new AxiosHeaders(config.headers);
      headers.set('X-Device-Fingerprint', this.generateFingerprint());
      headers.set('X-Session-Token', `session_${Date.now()}`);
      config.headers = headers;
      
      if (config.url?.includes('/product')) {
        config.params = {
          ...config.params,
          device_fingerprint: this.generateFingerprint(),
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
          // Token refresh logic would go here
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  private generateFingerprint(): string {
    return `fp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
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
        device_fingerprint: this.generateFingerprint(),
      },
    });
    
    return response.data;
  }
}

export default MobileApiClient;