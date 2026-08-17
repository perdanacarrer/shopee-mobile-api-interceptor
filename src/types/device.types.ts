// Device Configuration Types
export interface DeviceConfig {
  id: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  apiLevel: number;
  screenSize: string;
  screenDensity: number;
  ram: number; // in GB
  storage: number; // in GB
  cpu: string;
  gpu: string;
  imei: string;
  androidId: string;
  gsfId: string;
  buildFingerprint: string;
  serialNumber: string;
  macAddress: string;
  bluetoothAddress: string;
  wifiAddress: string;
  carrier: string;
  networkOperator: string;
  countryCode: string;
  language: string;
  timezone: string;
  isEmulator: boolean;
  isRooted: boolean;
  isDebugEnabled: boolean;
}

export interface DeviceStatus {
  deviceId: string;
  isActive: boolean;
  isBusy: boolean;
  isReady: boolean;
  lastUsed: Date;
  health: number;
  uptime: number; // in seconds
  errors: number;
  currentRequest?: {
    id: string;
    type: string;
    startTime: Date;
  };
  metrics: {
    cpuUsage: number;
    memoryUsage: number;
    networkLatency: number;
    responseTime: number;
    successRate: number;
    requestCount: number;
    errorCount: number;
  };
  battery: {
    level: number;
    charging: boolean;
  };
  connectivity: {
    type: 'wifi' | 'cellular' | 'none';
    signalStrength: number;
    ipAddress: string;
  };
}

export interface DeviceCapabilities {
  camera: boolean;
  gps: boolean;
  bluetooth: boolean;
  nfc: boolean;
  fingerprint: boolean;
  faceUnlock: boolean;
  accelerometer: boolean;
  gyroscope: boolean;
  magnetometer: boolean;
  lightSensor: boolean;
  proximitySensor: boolean;
}

export interface DeviceProfile {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  apiLevel: number;
  screenSize: string;
  ram: number;
  storage: number;
  userAgent: string;
  features: string[];
  capabilities: DeviceCapabilities;
}

// Device Farm Types
export interface DeviceFarmConfig {
  maxDevices: number;
  minDevices: number;
  preferredModels: string[];
  androidVersions: string[];
  enableEmulation: boolean;
  enablePhysicalDevices: boolean;
  healthCheckInterval: number;
  autoRestart: boolean;
  restartThreshold: number;
  loadBalancingStrategy: 'round-robin' | 'least-connections' | 'weighted' | 'random';
}

export interface DevicePool {
  devices: DeviceConfig[];
  statuses: Map<string, DeviceStatus>;
  availableDevices: Set<string>;
  busyDevices: Set<string>;
  healthyDevices: Set<string>;
  unhealthyDevices: Set<string>;
}

// Device Request Types
export interface DeviceRequest {
  id: string;
  deviceId: string;
  type: 'search' | 'detail' | 'checkout' | 'auth' | 'other';
  priority: 'high' | 'medium' | 'low';
  timestamp: Date;
  retries: number;
  maxRetries: number;
  data: any;
  metadata: Record<string, any>;
}

export interface DeviceResponse {
  id: string;
  requestId: string;
  deviceId: string;
  status: 'success' | 'error' | 'timeout' | 'retry';
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: Date;
  responseTime: number;
  retries: number;
}

// Device Health Types
export interface DeviceHealth {
  deviceId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
  score: number; // 0-100
  metrics: {
    cpu: number;
    memory: number;
    network: number;
    disk: number;
    temperature: number;
  };
  issues: DeviceIssue[];
  lastCheck: Date;
}

export interface DeviceIssue {
  type: 'performance' | 'connectivity' | 'authentication' | 'stability' | 'other';
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
  timestamp: Date;
  resolved: boolean;
}

// Device Authentication Types
export interface DeviceCredentials {
  deviceId: string;
  email: string;
  password: string;
  token?: string;
  refreshToken?: string;
  tokenExpiry?: Date;
  lastLogin?: Date;
  sessionId?: string;
}

// Device Proxy Types
export interface DeviceProxyConfig {
  deviceId: string;
  proxyHost: string;
  proxyPort: number;
  proxyProtocol: 'http' | 'https' | 'socks5';
  proxyUsername?: string;
  proxyPassword?: string;
  rotationInterval?: number;
  countryCode?: string;
  isRotating: boolean;
}

// Device Metrics Types
export interface DeviceMetrics {
  timestamp: Date;
  deviceId: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  timeoutCount: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestRate: number; // requests per second
  errorRate: number; // percentage
  successRate: number; // percentage
  trafficAmount: number; // in MB
  batteryDrain: number; // percentage per hour
}

// Utility Types
export interface DeviceFilter {
  model?: string | string[];
  androidVersion?: string | string[];
  ram?: number | { min?: number; max?: number };
  storage?: number | { min?: number; max?: number };
  isEmulator?: boolean;
  isRooted?: boolean;
  status?: 'active' | 'inactive' | 'busy' | 'available';
  health?: number | { min?: number; max?: number };
}

export interface DeviceSort {
  field: 'model' | 'androidVersion' | 'ram' | 'storage' | 'uptime' | 'health';
  order: 'asc' | 'desc';
}

// Export enums
export enum DeviceStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BUSY = 'busy',
  AVAILABLE = 'available',
  OFFLINE = 'offline',
  DEGRADED = 'degraded',
  MAINTENANCE = 'maintenance',
}

export enum DeviceTypeEnum {
  EMULATOR = 'emulator',
  PHYSICAL = 'physical',
  CLOUD = 'cloud',
  HYBRID = 'hybrid',
}

export enum DeviceConnectionType {
  USB = 'usb',
  WIFI = 'wifi',
  NETWORK = 'network',
  REMOTE = 'remote',
}