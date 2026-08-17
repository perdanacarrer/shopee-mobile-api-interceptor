export class TokenValidator {
  static validateToken(token: string): boolean {
    if (!token || token.length < 10) return false;
    
    // Check JWT format
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        return !!header && !!payload;
      } catch {
        return false;
      }
    }
    
    return true;
  }

  static decodeToken(token: string): any {
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        return JSON.parse(Buffer.from(parts[1], 'base64').toString());
      } catch {
        return null;
      }
    }
    return null;
  }
}