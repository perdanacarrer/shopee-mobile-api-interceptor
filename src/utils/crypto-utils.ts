import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

export class CryptoUtils {
  private static instance: CryptoUtils;
  private encryptionKey: Buffer;
  private iv: Buffer;

  private constructor() {
    // Generate or load encryption key
    this.encryptionKey = this.loadOrGenerateKey();
    this.iv = crypto.randomBytes(16);
  }

  public static getInstance(): CryptoUtils {
    if (!CryptoUtils.instance) {
      CryptoUtils.instance = new CryptoUtils();
    }
    return CryptoUtils.instance;
  }

  private loadOrGenerateKey(): Buffer {
    const keyPath = path.join(process.cwd(), 'data', 'encryption.key');
    
    if (fs.existsSync(keyPath)) {
      const keyData = fs.readFileSync(keyPath);
      if (keyData.length === 32) {
        return keyData;
      }
    }

    // Generate new key
    const key = crypto.randomBytes(32);
    
    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(keyPath, key);
    logger.info('New encryption key generated');
    
    return key;
  }

  // AES-256-GCM Encryption
  encrypt(data: string | Buffer): { encrypted: Buffer; iv: Buffer; tag: Buffer } {
    try {
      const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      
      const encrypted = Buffer.concat([
        cipher.update(input),
        cipher.final(),
      ]);
      
      const tag = cipher.getAuthTag();
      
      return { encrypted, iv, tag };
    } catch (error) {
      logger.error('Encryption failed', { error });
      throw new Error('Encryption failed');
    }
  }

  // AES-256-GCM Decryption
  decrypt(encrypted: Buffer, iv: Buffer, tag: Buffer): Buffer {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
    } catch (error) {
      logger.error('Decryption failed', { error });
      throw new Error('Decryption failed');
    }
  }

  // AES-256-CBC Encryption
  encryptCBC(data: string | Buffer): { encrypted: Buffer; iv: Buffer } {
    try {
      const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
      
      const encrypted = Buffer.concat([
        cipher.update(input),
        cipher.final(),
      ]);
      
      return { encrypted, iv };
    } catch (error) {
      logger.error('CBC Encryption failed', { error });
      throw new Error('CBC Encryption failed');
    }
  }

  // AES-256-CBC Decryption
  decryptCBC(encrypted: Buffer, iv: Buffer): Buffer {
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
    } catch (error) {
      logger.error('CBC Decryption failed', { error });
      throw new Error('CBC Decryption failed');
    }
  }

  // AES-256-CTR Encryption (for streaming)
  encryptCTR(data: string | Buffer): { encrypted: Buffer; iv: Buffer } {
    try {
      const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-ctr', this.encryptionKey, iv);
      
      const encrypted = Buffer.concat([
        cipher.update(input),
        cipher.final(),
      ]);
      
      return { encrypted, iv };
    } catch (error) {
      logger.error('CTR Encryption failed', { error });
      throw new Error('CTR Encryption failed');
    }
  }

  // AES-256-CTR Decryption
  decryptCTR(encrypted: Buffer, iv: Buffer): Buffer {
    try {
      const decipher = crypto.createDecipheriv('aes-256-ctr', this.encryptionKey, iv);
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
    } catch (error) {
      logger.error('CTR Decryption failed', { error });
      throw new Error('CTR Decryption failed');
    }
  }

  // RSA Encryption
  encryptRSA(data: string | Buffer, publicKey: string): Buffer {
    try {
      const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      return crypto.publicEncrypt(publicKey, input);
    } catch (error) {
      logger.error('RSA Encryption failed', { error });
      throw new Error('RSA Encryption failed');
    }
  }

  // RSA Decryption
  decryptRSA(encrypted: Buffer, privateKey: string): Buffer {
    try {
      return crypto.privateDecrypt(privateKey, encrypted);
    } catch (error) {
      logger.error('RSA Decryption failed', { error });
      throw new Error('RSA Decryption failed');
    }
  }

  // Hash Functions
  sha256(data: string | Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(data);
    return hash.digest('hex');
  }

  sha512(data: string | Buffer): string {
    const hash = crypto.createHash('sha512');
    hash.update(data);
    return hash.digest('hex');
  }

  md5(data: string | Buffer): string {
    const hash = crypto.createHash('md5');
    hash.update(data);
    return hash.digest('hex');
  }

  // HMAC
  hmacSha256(data: string | Buffer, key: string): string {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(data);
    return hmac.digest('hex');
  }

  hmacSha512(data: string | Buffer, key: string): string {
    const hmac = crypto.createHmac('sha512', key);
    hmac.update(data);
    return hmac.digest('hex');
  }

  // Generate random values
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  generateUUID(): string {
    return crypto.randomUUID();
  }

  generateSecurePassword(length: number = 16): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
    const bytes = crypto.randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset[bytes[i] % charset.length];
    }
    return password;
  }

  // Encrypt/Decrypt object
  encryptObject<T>(data: T): string {
    try {
      const json = JSON.stringify(data);
      const { encrypted, iv, tag } = this.encrypt(json);
      const result = {
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64'),
      };
      return Buffer.from(JSON.stringify(result)).toString('base64');
    } catch (error) {
      logger.error('Object encryption failed', { error });
      throw new Error('Object encryption failed');
    }
  }

  decryptObject<T>(encryptedData: string): T {
    try {
      const decoded = JSON.parse(Buffer.from(encryptedData, 'base64').toString());
      const iv = Buffer.from(decoded.iv, 'base64');
      const tag = Buffer.from(decoded.tag, 'base64');
      const data = Buffer.from(decoded.data, 'base64');
      
      const decrypted = this.decrypt(data, iv, tag);
      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      logger.error('Object decryption failed', { error });
      throw new Error('Object decryption failed');
    }
  }

  // Key derivation
  deriveKey(password: string, salt?: string): Buffer {
    const saltBuffer = salt 
      ? Buffer.from(salt, 'hex')
      : crypto.randomBytes(16);
    
    return crypto.pbkdf2Sync(password, saltBuffer, 100000, 32, 'sha256');
  }

  // Sign and verify
  sign(data: string | Buffer, privateKey: string): string {
    const sign = crypto.createSign('sha256');
    sign.update(data);
    sign.end();
    return sign.sign(privateKey, 'base64');
  }

  verify(data: string | Buffer, signature: string, publicKey: string): boolean {
    const verify = crypto.createVerify('sha256');
    verify.update(data);
    verify.end();
    return verify.verify(publicKey, signature, 'base64');
  }

  // Generate key pair
  generateKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
    return { publicKey, privateKey };
  }
}

// Export singleton instance
export const cryptoUtils = CryptoUtils.getInstance();