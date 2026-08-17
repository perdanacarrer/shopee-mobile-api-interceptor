import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export class DeviceFingerprint {
  private deviceId: string;
  private fingerprint: string | null = null;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  generate(): string {
    if (this.fingerprint) {
      return this.fingerprint;
    }

    const components = {
      deviceId: this.deviceId,
      timestamp: Date.now(),
      random: Math.random().toString(36),
      screenSize: this.generateScreenSize(),
      androidId: this.generateAndroidId(),
      gsfId: this.generateGsfId(),
    };

    const fingerprintData = JSON.stringify(components);
    this.fingerprint = crypto
      .createHash('sha256')
      .update(fingerprintData)
      .digest('hex');
    
    return this.fingerprint;
  }

  getHash(): string {
    return this.fingerprint || this.generate();
  }

  private generateScreenSize(): string {
    const sizes = [
      '1080x2400',
      '1440x3200',
      '1080x2340',
      '1242x2688',
      '828x1792',
    ];
    return sizes[Math.floor(Math.random() * sizes.length)];
  }

  private generateAndroidId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private generateGsfId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  regenerate(): string {
    this.fingerprint = null;
    return this.generate();
  }
}