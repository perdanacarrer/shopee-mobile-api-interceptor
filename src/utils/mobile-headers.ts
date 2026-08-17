import { v4 as uuidv4 } from 'uuid';

export interface MobileHeaders {
  'User-Agent': string;
  'Accept': string;
  'Accept-Encoding': string;
  'Accept-Language': string;
  'Connection': string;
  'Content-Type'?: string;
  'X-Device-Fingerprint'?: string;
  'X-Session-Token'?: string;
  'X-Platform'?: string;
  'X-Version'?: string;
  'X-Device-ID'?: string;
  'X-App-Version'?: string;
  'X-Android-ID'?: string;
  'X-GSF-ID'?: string;
  'X-Request-ID'?: string;
  [key: string]: string | undefined;
}

export interface DeviceInfo {
  model: string;
  manufacturer: string;
  androidVersion: string;
  apiLevel: number;
  screenSize: string;
  screenDensity: number;
  language: string;
  country: string;
  timezone: string;
  carrier: string;
  networkType: 'wifi' | 'cellular' | '5g' | '4g' | '3g';
  appVersion: string;
  appBuild: string;
  deviceId: string;
}

export class MobileHeaderGenerator {
  private deviceInfo: DeviceInfo;
  private static readonly DEVICE_MAPPINGS: Record<string, any> = {
    'SM-G998B': {
      userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      manufacturer: 'Samsung',
      screenSize: '1440x3200',
      screenDensity: 515,
    },
    'SM-N986B': {
      userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-N986B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      manufacturer: 'Samsung',
      screenSize: '1440x3040',
      screenDensity: 493,
    },
    'Pixel 6': {
      userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      manufacturer: 'Google',
      screenSize: '1080x2400',
      screenDensity: 411,
    },
    'Pixel 7 Pro': {
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      manufacturer: 'Google',
      screenSize: '1440x3120',
      screenDensity: 512,
    },
    'OnePlus 9': {
      userAgent: 'Mozilla/5.0 (Linux; Android 12; OnePlus 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      manufacturer: 'OnePlus',
      screenSize: '1080x2400',
      screenDensity: 402,
    },
    'iPhone13': {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
      manufacturer: 'Apple',
      screenSize: '1170x2532',
      screenDensity: 460,
    },
    'iPhone14': {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      manufacturer: 'Apple',
      screenSize: '1170x2532',
      screenDensity: 460,
    },
  };

  constructor(deviceId?: string) {
    this.deviceInfo = this.generateDeviceInfo(deviceId);
  }

  private generateDeviceInfo(deviceId?: string): DeviceInfo {
    const models = Object.keys(MobileHeaderGenerator.DEVICE_MAPPINGS);
    const model = models[Math.floor(Math.random() * models.length)];
    const deviceData = MobileHeaderGenerator.DEVICE_MAPPINGS[model];

    const languages = ['en-US', 'en-GB', 'id-ID', 'th-TH', 'vi-VN', 'zh-CN', 'zh-TW'];
    const countries = ['US', 'GB', 'ID', 'TH', 'VN', 'CN', 'TW'];
    const timezones = ['America/New_York', 'Europe/London', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Shanghai', 'Asia/Taipei'];
    const carriers = ['Telkomsel', 'XL Axiata', 'Indosat', 'Smartfren', 'T-Mobile', 'Verizon', 'AT&T'];
    const networkTypes = ['wifi', '5g', '4g', '4g', '4g', '3g'] as const;

    return {
      model,
      manufacturer: deviceData.manufacturer,
      androidVersion: Math.random() > 0.5 ? '13' : '12',
      apiLevel: Math.random() > 0.5 ? 33 : 31,
      screenSize: deviceData.screenSize,
      screenDensity: deviceData.screenDensity,
      language: languages[Math.floor(Math.random() * languages.length)],
      country: countries[Math.floor(Math.random() * countries.length)],
      timezone: timezones[Math.floor(Math.random() * timezones.length)],
      carrier: carriers[Math.floor(Math.random() * carriers.length)],
      networkType: networkTypes[Math.floor(Math.random() * networkTypes.length)],
      appVersion: `${Math.floor(Math.random() * 5) + 1}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`,
      appBuild: String(Math.floor(Math.random() * 1000) + 1000),
      deviceId: deviceId || this.generateDeviceId(),
    };
  }

  private generateDeviceId(): string {
    return `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  generateBaseHeaders(): MobileHeaders {
    const deviceData = MobileHeaderGenerator.DEVICE_MAPPINGS[this.deviceInfo.model] || 
                       MobileHeaderGenerator.DEVICE_MAPPINGS['SM-G998B'];

    return {
      'User-Agent': deviceData.userAgent,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': `${this.deviceInfo.language},${this.deviceInfo.language.split('-')[0]};q=0.9`,
      'Connection': 'keep-alive',
      'X-Platform': 'android',
      'X-Device-ID': this.deviceInfo.deviceId,
      'X-Request-ID': uuidv4(),
    };
  }

  generateMobileHeaders(): MobileHeaders {
    const headers = this.generateBaseHeaders();
    
    return {
      ...headers,
      'X-App-Version': this.deviceInfo.appVersion,
      'X-App-Build': this.deviceInfo.appBuild,
      'X-Android-ID': this.generateAndroidId(),
      'X-GSF-ID': this.generateGsfId(),
      'X-Device-Fingerprint': this.generateFingerprint(),
      'X-Network-Type': this.deviceInfo.networkType,
      'X-Carrier': this.deviceInfo.carrier,
      'X-Device-Model': this.deviceInfo.model,
      'X-OS-Version': this.deviceInfo.androidVersion,
      'X-API-Level': String(this.deviceInfo.apiLevel),
      'X-Screen-Size': this.deviceInfo.screenSize,
      'X-Screen-Density': String(this.deviceInfo.screenDensity),
      'X-Time-Zone': this.deviceInfo.timezone,
      'X-Country': this.deviceInfo.country,
      'X-Language': this.deviceInfo.language,
    };
  }

  generateAuthHeaders(token: string): MobileHeaders {
    return {
      ...this.generateMobileHeaders(),
      'Authorization': `Bearer ${token}`,
      'X-Session-Token': token,
    };
  }

  generateApiHeaders(token?: string): MobileHeaders {
    const headers = this.generateMobileHeaders();
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Session-Token'] = token;
    }
    
    headers['Content-Type'] = 'application/json';
    headers['Accept'] = 'application/json';
    
    return headers;
  }

  generateMultipartHeaders(token?: string): MobileHeaders {
    const headers = this.generateApiHeaders(token);
    headers['Content-Type'] = 'multipart/form-data';
    return headers;
  }

  private generateAndroidId(): string {
    return Array.from({ length: 16 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private generateGsfId(): string {
    return Array.from({ length: 16 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private generateFingerprint(): string {
    const components = [
      this.deviceInfo.deviceId,
      this.deviceInfo.model,
      this.deviceInfo.manufacturer,
      this.deviceInfo.androidVersion,
      this.deviceInfo.screenSize,
      this.deviceInfo.language,
      this.deviceInfo.country,
      this.deviceInfo.appVersion,
      Date.now().toString(36),
      Math.random().toString(36).substring(2, 10),
    ];
    
    return require('crypto')
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  rotateDevice(): void {
    this.deviceInfo = this.generateDeviceInfo(this.deviceInfo.deviceId);
  }

  getDeviceInfo(): DeviceInfo {
    return { ...this.deviceInfo };
  }

  updateDeviceInfo(updates: Partial<DeviceInfo>): void {
    this.deviceInfo = {
      ...this.deviceInfo,
      ...updates,
    };
  }

  // Shopee-specific header generation
  generateShopeeHeaders(token?: string): MobileHeaders {
    const headers = this.generateApiHeaders(token);
    
    // Add Shopee-specific headers
    return {
      ...headers,
      'X-Shopee-App': 'shopee',
      'X-Shopee-Platform': 'android',
      'X-Shopee-Client-Type': 'mobile',
      'X-Shopee-API-Version': '4',
      'X-Shopee-Language': this.deviceInfo.language,
      'X-Shopee-Country': this.deviceInfo.country,
      'X-Shopee-Currency': this.getCurrencyForCountry(this.deviceInfo.country),
      'X-Shopee-Timezone': this.deviceInfo.timezone,
      'X-Shopee-Device': this.deviceInfo.model,
      'X-Shopee-OS': `Android ${this.deviceInfo.androidVersion}`,
      'X-Shopee-App-Version': this.deviceInfo.appVersion,
      'X-Shopee-Build-Number': this.deviceInfo.appBuild,
    };
  }

  private getCurrencyForCountry(country: string): string {
    const currencyMap: Record<string, string> = {
      'ID': 'IDR',
      'TH': 'THB',
      'VN': 'VND',
      'SG': 'SGD',
      'MY': 'MYR',
      'PH': 'PHP',
      'TW': 'TWD',
      'US': 'USD',
      'GB': 'GBP',
      'CN': 'CNY',
    };
    return currencyMap[country] || 'USD';
  }

  // Generate multiple device headers for rotation
  generateRotatingHeaders(count: number = 10): MobileHeaders[] {
    const headers: MobileHeaders[] = [];
    const originalDevice = { ...this.deviceInfo };
    
    for (let i = 0; i < count; i++) {
      this.rotateDevice();
      headers.push(this.generateMobileHeaders());
    }
    
    // Restore original device
    this.deviceInfo = originalDevice;
    
    return headers;
  }

  // Get web view headers (for WebView-based requests)
  generateWebViewHeaders(): MobileHeaders {
    const headers = this.generateMobileHeaders();
    
    return {
      ...headers,
      'User-Agent': `Mozilla/5.0 (Linux; Android ${this.deviceInfo.androidVersion}; ${this.deviceInfo.model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36`,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
    };
  }

  // Get header for specific API endpoint
  getHeadersForEndpoint(endpoint: string, token?: string): MobileHeaders {
    const baseHeaders = this.generateShopeeHeaders(token);
    
    // Customize headers based on endpoint
    switch (endpoint) {
      case '/auth/login':
        return {
          ...baseHeaders,
          'Content-Type': 'application/json',
        };
      case '/product/search':
        return {
          ...baseHeaders,
          'Cache-Control': 'no-cache',
        };
      case '/product/detail':
        return {
          ...baseHeaders,
          'Cache-Control': 'max-age=300',
        };
      case '/checkout':
        return {
          ...baseHeaders,
          'Content-Type': 'application/json',
          'X-Shopee-Checkout-Version': '2',
        };
      default:
        return baseHeaders;
    }
  }
}

// Export singleton instance with random device
export const mobileHeaderGenerator = new MobileHeaderGenerator();