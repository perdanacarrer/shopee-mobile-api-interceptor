import { MobileHeaderGenerator, MobileHeaders } from './mobile-headers';

export class EnhancedMobileHeaderGenerator extends MobileHeaderGenerator {
  private static readonly DEVICE_DATABASE: Record<string, any> = {
    // Samsung devices
    'SM-G998B': {
      model: 'SM-G998B',
      manufacturer: 'Samsung',
      userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      screenSize: '1440x3200',
      screenDensity: 515,
      cpu: 'Exynos 2100',
      gpu: 'Mali-G78 MP14',
      features: ['5G', 'WiFi6', 'Bluetooth5.2', 'NFC', 'Fingerprint', 'FaceUnlock'],
    },
    'SM-N986B': {
      model: 'SM-N986B',
      manufacturer: 'Samsung',
      userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-N986B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      screenSize: '1440x3040',
      screenDensity: 493,
      cpu: 'Exynos 990',
      gpu: 'Mali-G77 MP11',
      features: ['5G', 'WiFi6', 'Bluetooth5.0', 'NFC', 'Fingerprint', 'S-Pen'],
    },
    'Pixel 6': {
      model: 'Pixel 6',
      manufacturer: 'Google',
      userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      screenSize: '1080x2400',
      screenDensity: 411,
      cpu: 'Google Tensor',
      gpu: 'Mali-G78 MP20',
      features: ['5G', 'WiFi6', 'Bluetooth5.2', 'NFC', 'Fingerprint', 'FaceUnlock'],
    },
    'iPhone13': {
      model: 'iPhone 13',
      manufacturer: 'Apple',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
      screenSize: '1170x2532',
      screenDensity: 460,
      cpu: 'A15 Bionic',
      gpu: 'Apple GPU (4-core)',
      features: ['5G', 'WiFi6', 'Bluetooth5.0', 'NFC', 'FaceID', 'CeramicShield'],
    },
  };

  constructor(deviceId?: string) {
    super(deviceId);
  }

  generateRealisticHeaders(): MobileHeaders {
    const deviceInfo = this.getDeviceInfo();
    const deviceData = EnhancedMobileHeaderGenerator.DEVICE_DATABASE[deviceInfo.model] || 
                       EnhancedMobileHeaderGenerator.DEVICE_DATABASE['SM-G998B'];

    const headers = this.generateMobileHeaders();
    
    return {
      ...headers,
      'User-Agent': deviceData.userAgent,
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': `${deviceInfo.language};q=0.9,en-US;q=0.8,en;q=0.7`,
      'Cache-Control': Math.random() > 0.7 ? 'no-cache' : 'max-age=0',
      'Pragma': Math.random() > 0.8 ? 'no-cache' : undefined,
      'X-Requested-With': 'XMLHttpRequest',
      'X-Session-ID': this.generateSessionId(),
      'X-Client-ID': this.generateClientId(),
      'X-Timestamp': new Date().toISOString(),
      'X-Nonce': this.generateNonce(),
      'Origin': `https://shopee.co.id`,
      'Referer': `https://shopee.co.id/`,
    } as MobileHeaders;
  }

  generateSeoHeaders(): MobileHeaders {
    const headers = this.generateRealisticHeaders();
    
    return {
      ...headers,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      'Cache-Control': 'max-age=0',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    };
  }

  generateImageHeaders(): MobileHeaders {
    const headers = this.generateRealisticHeaders();
    
    return {
      ...headers,
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Cache-Control': 'max-age=31536000',
      'If-Modified-Since': new Date(Date.now() - Math.random() * 86400000).toUTCString(),
      'If-None-Match': `"${this.generateETag()}"`,
    };
  }

  generateDownloadHeaders(): MobileHeaders {
    const headers = this.generateRealisticHeaders();
    
    return {
      ...headers,
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Range': 'bytes=0-',
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  private generateNonce(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private generateETag(): string {
    return `"${Math.random().toString(36).substring(2, 15)}"`;
  }

  getDeviceDatabase(): Record<string, any> {
    return EnhancedMobileHeaderGenerator.DEVICE_DATABASE;
  }

  getDeviceByModel(model: string): any {
    return EnhancedMobileHeaderGenerator.DEVICE_DATABASE[model] || null;
  }

  getAllModels(): string[] {
    return Object.keys(EnhancedMobileHeaderGenerator.DEVICE_DATABASE);
  }

  getRandomDevice(): any {
    const models = this.getAllModels();
    const model = models[Math.floor(Math.random() * models.length)];
    return {
      model,
      ...EnhancedMobileHeaderGenerator.DEVICE_DATABASE[model],
    };
  }
}

export default EnhancedMobileHeaderGenerator;