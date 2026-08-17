#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

console.log('🚀 Setting up Shopee Mobile API Interceptor...\n');

// Create necessary directories
const directories = [
  'data',
  'logs',
  'apk-analysis',
  'captured-traffic',
  'device-farm-data',
  'apk-analysis/reports',
  'apk-analysis/decompiled',
  'apk-analysis/classes',
  'apk-analysis/resources',
  'apk-analysis/temp',
];

console.log('📁 Creating directories...');
for (const dir of directories) {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`  ✅ Created: ${dir}`);
  } else {
    console.log(`  ⏭️  Already exists: ${dir}`);
  }
}

// Create .env file if it doesn't exist
console.log('\n📝 Setting up environment...');
const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  const envExample = `# Mobile API Configuration
SHOPEE_MOBILE_BASE_URL=https://shopee.co.id/api/v4
SHOPEE_MOBILE_API_VERSION=4.0.0
SHOPEE_APP_PACKAGE=com.shopee.id
SHOPEE_DOMAIN=shopee.co.id

# Device Configuration
DEFAULT_DEVICE_MODEL=SM-G998B
DEFAULT_ANDROID_VERSION=12
DEFAULT_APP_VERSION=4.0.0
MIN_DEVICES=5
MAX_DEVICES=50

# Proxy Configuration
PROXY_ENABLED=false
PROXY_HOST=localhost
PROXY_PORT=8080
PROXY_PROTOCOL=http

# Authentication
TOKEN_REFRESH_THRESHOLD=300
MAX_SESSION_AGE=86400
MAX_USES_PER_SESSION=1000
ACCOUNT_POOL_SIZE=20

# Scaling
MAX_CONCURRENT_REQUESTS=100
LOAD_BALANCING_STRATEGY=least-busy
CIRCUIT_BREAKER_THRESHOLD=5
HEALTH_CHECK_INTERVAL=30

# Cache
CACHE_ENABLED=true
CACHE_TTL=300
CACHE_MAX_SIZE=1000

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs/mobile.log

# Android SDK (optional - for emulator support)
# ANDROID_HOME=/path/to/android-sdk

# Redis (optional - for distributed caching)
# REDIS_URL=redis://localhost:6379
`;

  fs.writeFileSync(envPath, envExample);
  console.log('  ✅ Created: .env');
} else {
  console.log('  ⏭️  Already exists: .env');
}

// Check for required tools
console.log('\n🔧 Checking required tools...');

const tools = [
  { name: 'Node.js', command: 'node --version' },
  { name: 'npm', command: 'npm --version' },
  { name: 'TypeScript', command: 'npx tsc --version' },
];

for (const tool of tools) {
  try {
    const output = execSync(tool.command, { stdio: 'pipe' }).toString().trim();
    console.log(`  ✅ ${tool.name}: ${output}`);
  } catch (error) {
    console.log(`  ❌ ${tool.name}: Not found`);
  }
}

// Optional tools
console.log('\n🔧 Checking optional tools...');

const optionalTools = [
  { name: 'ADB', command: 'adb version' },
  { name: 'Frida', command: 'frida --version' },
  { name: 'APKTool', command: 'apktool --version' },
  { name: 'JADX', command: 'jadx --version' },
];

for (const tool of optionalTools) {
  try {
    const output = execSync(tool.command, { stdio: 'pipe' }).toString().trim();
    console.log(`  ✅ ${tool.name}: ${output.split('\n')[0]}`);
  } catch (error) {
    console.log(`  ⚠️  ${tool.name}: Not installed (optional)`);
  }
}

console.log('\n📦 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('  ✅ Dependencies installed');
} catch (error) {
  console.error('  ❌ Failed to install dependencies');
}

console.log('\n🏗️ Building project...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('  ✅ Build completed');
} catch (error) {
  console.error('  ❌ Build failed');
}

console.log('\n✅ Setup completed successfully!');
console.log('\n📖 Quick Start:');
console.log('  1. Place your Shopee APK in the project root');
console.log('  2. Run: npm run analyze-apk -- -a ./shopee.apk');
console.log('  3. Run: npm run capture-traffic');
console.log('  4. Run: npm run extract-tokens');
console.log('  5. Run: npm run deploy-device-farm');
console.log('\n📚 For more information, see README.md');