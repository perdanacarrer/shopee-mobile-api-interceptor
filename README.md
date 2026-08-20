# Advanced Shopee Mobile API Scraper

## Overview

The Shopee Mobile API Interceptor project is built to reverse engineer, capture, analyze, and automate mobile API interactions with Shopee by defeating mobile application security defenses.

## Features

### Mobile API Interception
- Native Android app API reverse engineering
- SSL pinning bypass using Frida
- Dynamic API endpoint discovery
- Mobile-specific authentication token extraction

### Advanced Anti-Detection
- Device fingerprint simulation
- Mobile user agent generation
- Authentic mobile session replication
- Distributed device farm with multiple identities

### Scaling Architecture
- Multiple device simulation
- Authentication pool management
- Load-balanced request distribution
- Redis-based caching with TTL
- Rate limiting with burst handling

## Architecture
```bash
┌─────────────────────────────────────────────────────┐
│                   API Gateway                       │
│              (Express.js Server)                    │
├─────────────────────────────────────────────────────┤
│                  Load Balancer                      │
│              (Request Distribution)                 │
├─────────────────────────────────────────────────────┤
│              Authentication Pool                    │
│           (Token Management & Rotation)             │
├─────────────────────────────────────────────────────┤
│              Device Farm Manager                    │
│         (Android Emulators Management)              │
├─────────────────────────────────────────────────────┤
│          Frida Script Injection                     │
│      (SSL Bypass & API Hooking)                    │
└─────────────────────────────────────────────────────┘
```

## Project Structure
```bash
shopee-mobile-api-interceptor/
├── src/                            # TypeScript source code
│   ├── index.ts                    # Main application entry point
│   ├── api/                        # REST API layer to expose interceptor capabilities
│   │   └── routes/mobile-routes.ts # Interceptor API routes
│   ├── config/                     # Configuration definitions
│   │   └── mobile-config.ts        # Target endpoints, headers, and device settings
│   ├── mobile/                     # Core Mobile Reverse Engineering & Interception Modules
│   │   ├── api-client/             # Emulated API Client
│   │   │   ├── authentication.ts   # Session & auth token management
│   │   │   ├── device-fingerprint.ts# Device parameters generation (IMEI, Android ID, etc.)
│   │   │   ├── mobile-client.ts    # Main HTTP client configured for Shopee endpoints
│   │   │   └── mobile-api-client.ts# Wrappers for specific Shopee API endpoints
│   │   ├── interception/           # Network Proxy & Traffic Interception
│   │   │   ├── pattern-analyzer.ts # Analyzes endpoint signatures and response formats
│   │   │   ├── proxy-server.ts     # MITM proxy engine (handling HTTPS interception)
│   │   │   └── request-logger.ts   # Structured logger for intercepted payloads
│   │   ├── reverse-engineering/    # Binary Analysis & Frida Instrumentation
│   │   │   ├── apk-analyzer.ts     # Extracts endpoint targets, keys, and assets from APK
│   │   │   ├── endpoint-discovery.ts# Identifies hidden/internal mobile endpoints
│   │   │   └── ssl-bypass.ts       # Coordinates Frida SSL pinning bypass execution
│   │   └── scaling/                # Farm & Session Infrastructure
│   │       ├── device-farm.ts      # Manages physical/emulated Android device clusters
│   │       ├── load-balancer.ts    # Distributes requests across session/device instances
│   │       └── session-pool.ts     # Rotates authenticated sessions and device tokens
│   ├── types/                      # TypeScript type definitions
│   └── utils/                      # Helper Utilities
│       ├── crypto-utils.ts         # Cryptographic helpers for payload signing/hashing
│       ├── mobile-headers.ts       # Mobile-specific header generators
│       ├── mobile-headers-enhanced.ts# Advanced header emulation (anti-bot headers)
│       ├── proxy-utils.ts          # Proxy rotation and networking helpers
│       ├── rate-limiter.ts         # Request rate throttling
│       └── token-validator.ts      # Validates captured authorization tokens
├── frida-scripts/                  # Runtime Instrumentation Scripts (Frida Injection)
│   ├── api-hook.js                 # Hooks native/Java methods generating signatures
│   ├── ssl-kill-switch.js          # Disables SSL Pinning in real time
│   ├── token-grabber.js            # Hooks internal state to exfiltrate active session tokens
│   └── token-grabber-v2.js         # Enhanced hook targeting native token generation logic
├── scripts/                        # Automation & Setup Shell/TypeScript Scripts
│   ├── capture-traffic.ts          # Automated traffic interception task
│   ├── deploy-device-farm.ts       # Device orchestration script
│   ├── extract-tokens.ts           # Automated token extraction pipeline
│   ├── setup-all.sh                # Complete environment bootstrap
│   ├── setup-frida.ts              # Sets up Frida server on target devices
│   └── start-frida.sh              # Spawns target APK with injected Frida hooks
├── apk-analysis/                   # Storage for unpacked APK artifacts
├── captured-traffic/               # Saved requests/responses JSON logs
└── Dockerfile & docker-compose.yml # Containerized deployment setup

```
---

### Approach to Bypass Shopee’s Protection Mechanisms

Shopee employs multi layered mobile client security. The codebase systematically defeats these defenses using dynamic runtime analysis and native hook techniques:

#### 1. Bypassing SSL Pinning & TLS Fingerprinting

* **Mechanism:** Shopee enforces SSL Pinning via custom Android `TrustManager`, OkHttp certificate pinners, or native OpenSSL/BoringSSL checks.
* **Bypass Strategy (`frida-scripts/ssl-kill-switch.js` & `src/mobile/reverse-engineering/ssl-bypass.ts`):**
* Hooks Java-level `X509TrustManager`, `TrustManagerFactory`, and `NetworkSecurityConfig` to force trust on custom intercepting CA certificates (used by `proxy-server.ts`).
* Hooks low-level socket and native SSL verification functions in C/C++ libraries (`libsslc.so` / `libcrypto.so`) to return `0` (Success) regardless of certificate validity.


#### 2. Defeating Payload Signing & Device Integrity Checks

* **Mechanism:** Mobile requests require custom signature headers (e.g., `SPC-SIGN`, `SPC-CERT`, device hashes) generated in compiled native code (`.so` binaries) using request parameters, timestamps, and hardcoded salt keys.
* **Bypass Strategy (`frida-scripts/api-hook.js` & `frida-scripts/token-grabber-v2.js`):**
* Rather than fully reverse-engineering complex JNI native routines, the project uses **Frida dynamic memory hooking**.
* It hooks internal native functions responsible for signing request payloads and extracts the output signature directly from memory in real time before transmission.
* Extracted signatures and tokens are passed back to `extract-tokens.ts` and managed via `session-pool.ts`.

#### 3. Emulating Device Fingerprinting & Anti-Bot Detection

* **Mechanism:** Shopee collects environment telemetry (Android ID, IMEI, build properties, hardware metrics) to identify automated scrapers or non-standard device environments.
* **Bypass Strategy (`src/mobile/api-client/device-fingerprint.ts` & `src/utils/mobile-headers-enhanced.ts`):**
* Generates consistent, realistic device fingerprints dynamically (matching genuine Android device specifications).
* Obfuscates proxy connections using `proxy-utils.ts` and orchestrates multi-device pools via `device-farm.ts` and `load-balancer.ts` to evade IP/device rate limits and behavioral detection.

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Android SDK (for device emulation)
- Frida tools

### Installation

```bash
# Clone repository
git clone https://github.com/perdanacarrer/shopee-mobile-api-interceptor.git
cd shopee-mobile-api-interceptor

# Install dependencies
npm install

# Setup everything
npm run setup:mobile

# Or setup step by step
cp .env.example .env
npm install
npm run build
npm run setup:frida

# Start the server
npm run start:mobile

# Activate the virtual environment
source venv/bin/activate

# Create AVD with both rooted and Play Store
sdkmanager "system-images;android-33;google_apis_playstore;arm64-v8a"
avdmanager create avd -n Rooted_With_PlayStore -k "system-images;android-33;google_apis_playstore;arm64-v8a" -d "pixel_6" --force
echo "disk.dataPartition.size=4G" >> ~/.android/avd/Rooted_With_PlayStore.avd/config.ini
emulator -avd Rooted_With_PlayStore -no-audio -writable-system &
adb wait-for-device
adb root
adb shell setenforce 0

# Push frida server to rooted Emulator
ls -la ~/Downloads/frida-server-17.17.0-android-arm64
cd ~/Downloads
curl -L -O https://github.com/frida/frida/releases/download/17.17.0/frida-server-17.17.0-android-arm64.xz
xz -d frida-server-17.17.0-android-arm64.xz
adb push ~/Downloads/frida-server-17.17.0-android-arm64 /data/local/tmp/frida-server
adb shell chmod 755 /data/local/tmp/frida-server
adb shell ls -la /data/local/tmp/frida-server
adb shell "/data/local/tmp/frida-server &"
adb forward tcp:27042 tcp:27042
frida-ps -U
frida -U -p Shopee PID 

or

frida -U -p Shopee PID -l frida-scripts/token-grabber-v2.js

# At the [Android Emulator emulatorID::PID::Shopee PID ]-> prompt, try these commands: (choose which of these you need)

# Hook OkHttp to see API calls
Java.perform(function() {
    try {
        var Builder = Java.use("okhttp3.Request$Builder");
        Builder.build.implementation = function() {
            var request = this.build();
            console.log("📤 URL: " + request.url());
            console.log("📤 Method: " + request.method());
            return request;
        };
        console.log("✅ Request hook installed!");
    } catch(e) {
        console.log("⚠️ OkHttp not found: " + e);
    }
});

# Hook specific Shopee network classes
Java.perform(function() {
    console.log("🔍 Hooking Shopee network classes...");
    
    try {
        Java.enumerateLoadedClasses({
            onMatch: function(className) {
                if (className.includes("shopee") && className.includes("Interceptor")) {
                    console.log("Found: " + className);
                }
            },
            onComplete: function() {}
        });
    } catch(e) {}
});

# Hook network responses
Java.perform(function() {
    try {
        var Response = Java.use("okhttp3.Response");
        Response.code.implementation = function() {
            var code = this.code();
            console.log("📥 Response code: " + code);
            return code;
        };
        console.log("✅ Response hook installed!");
    } catch(e) {
        console.log("⚠️ Response hook failed: " + e);
    }
});

# Hook the real network calls
Java.perform(function() {
    console.log("🔍 Hooking OkHttp network calls...");
    
    try {
        var RealInterceptorChain = Java.use("okhttp3.internal.http.RealInterceptorChain");
        RealInterceptorChain.proceed.overload('okhttp3.Request').implementation = function(request) {
            console.log("═══════════════════════════════════════");
            console.log("📤 REQUEST");
            console.log("  URL: " + request.url());
            console.log("  Method: " + request.method());
            
            try {
                var headers = request.headers();
                console.log("  Headers:");
                for (var i = 0; i < headers.size(); i++) {
                    var name = headers.name(i);
                    var value = headers.value(i);
                    if (name.toLowerCase().includes("token") || 
                        name.toLowerCase().includes("auth") ||
                        name.toLowerCase().includes("device") ||
                        name.toLowerCase().includes("fingerprint") ||
                        name.toLowerCase().includes("user-agent")) {
                        console.log("    " + name + ": " + value);
                    }
                }
            } catch(e) {}
            
            try {
                var body = request.body();
                if (body) {
                    console.log("  Body: " + body);
                }
            } catch(e) {}
            
            var response = this.proceed(request);
            console.log("📥 RESPONSE: " + response.code());
            console.log("═══════════════════════════════════════");
            return response;
        };
        console.log("✅ RealInterceptorChain hooked!");
    } catch(e) {
        console.log("⚠️ RealInterceptorChain hook failed: " + e);
    }
});

# Hook JSON responses
Java.perform(function() {
    try {
        var JSONObject = Java.use("org.json.JSONObject");
        JSONObject.toString.overload().implementation = function() {
            var result = this.toString();
            if (result.length < 1000) {
                console.log("📄 JSON: " + result);
            } else {
                console.log("📄 JSON: " + result.substring(0, 300) + "...");
            }
            return result;
        };
        console.log("✅ JSON hook installed!");
    } catch(e) {
        console.log("⚠️ JSON hook failed: " + e);
    }
});

# Extract device fingerprint
Java.perform(function() {
    console.log("🔑 Extracting device fingerprint...");
    
    try {
        var DeviceInfoManager = Java.use("com.shopee.shopeetracker.deviceInfo.DeviceInfoManager");
        DeviceInfoManager.getDeviceId.implementation = function() {
            var id = this.getDeviceId();
            console.log("📱 Device ID: " + id);
            return id;
        };
        console.log("✅ Device ID hooked!");
    } catch(e) {
        console.log("⚠️ DeviceInfoManager not found: " + e);
    }
});

# Find Shopee API base URL
Java.perform(function() {
    console.log("🔍 Looking for API base URL...");
    
    Java.enumerateLoadedClasses({
        onMatch: function(className) {
            if (className.includes("shopee") && 
                (className.includes("Api") || className.includes("Endpoint") || className.includes("Network"))) {
                console.log("Found: " + className);
            }
        },
        onComplete: function() {}
    });
});

# Hook Shopee's custom network interceptor
Java.perform(function() {
    console.log("🔍 Hooking Shopee's network interceptor...");
    
    try {
        var LoginInterceptor = Java.use("com.shopee.bke.base.sdk.router.interceptor.LoginInterceptor");
        LoginInterceptor.intercept.implementation = function(chain) {
            console.log("🔐 LoginInterceptor called");
            var request = chain.request();
            console.log("  URL: " + request.url());
            return this.intercept(chain);
        };
        console.log("✅ LoginInterceptor hooked!");
    } catch(e) {
        console.log("⚠️ LoginInterceptor hook failed: " + e);
    }
});

# Hook the GzipRequestInterceptor
Java.perform(function() {
    console.log("🔍 Hooking GzipRequestInterceptor...");
    
    try {
        var GzipInterceptor = Java.use("com.shopee.seabanktracker.interceptors.GzipRequestInterceptor");
        GzipInterceptor.intercept.implementation = function(chain) {
            var request = chain.request();
            console.log("📦 Gzip request: " + request.url());
            return this.intercept(chain);
        };
        console.log("✅ GzipInterceptor hooked!");
    } catch(e) {
        console.log("⚠️ GzipInterceptor hook failed: " + e);
    }
});

# Once you see API calls, run this to capture tokens:
Java.perform(function() {
    console.log("🔑 Capturing authentication tokens...");
    
    try {
        var SharedPreferences = Java.use("android.content.SharedPreferences");
        SharedPreferences.getString.overload('java.lang.String', 'java.lang.String').implementation = function(key, defValue) {
            var value = this.getString(key, defValue);
            if (key.toLowerCase().includes("token") || 
                key.toLowerCase().includes("auth") ||
                key.toLowerCase().includes("session") ||
                key.toLowerCase().includes("device")) {
                console.log("🔑 " + key + " = " + value);
            }
            return value;
        };
        console.log("✅ Token capture started!");
    } catch(e) {
        console.log("⚠️ Token capture failed: " + e);
    }
});

# To see ALL headers including authentication:
Java.perform(function() {
    var RealInterceptorChain = Java.use("okhttp3.internal.http.RealInterceptorChain");
    RealInterceptorChain.proceed.overload('okhttp3.Request').implementation = function(request) {
        var url = request.url().toString();
        
        if (url.includes("shopee")) {
            console.log("\n═══════════════════════════════════════");
            console.log("📤 " + request.method() + " " + url);
            
            try {
                var headers = request.headers();
                console.log("  📋 ALL HEADERS:");
                for (var i = 0; i < headers.size(); i++) {
                    var name = headers.name(i);
                    var value = headers.value(i);
                    console.log("    " + name + ": " + value);
                }
            } catch(e) {}
        }
        
        var response = this.proceed(request);
        return response;
    };
    console.log("✅ Detailed header logging enabled!");
});

# Create a script to save captured API calls:
var capturedCalls = [];

Java.perform(function() {
    var RealInterceptorChain = Java.use("okhttp3.internal.http.RealInterceptorChain");
    RealInterceptorChain.proceed.overload('okhttp3.Request').implementation = function(request) {
        var url = request.url().toString();
        var method = request.method().toString();
        
        capturedCalls.push({
            timestamp: new Date().toISOString(),
            method: method,
            url: url,
            headers: {}
        });
        
        try {
            var headers = request.headers();
            for (var i = 0; i < headers.size(); i++) {
                var name = headers.name(i);
                var value = headers.value(i);
                capturedCalls[capturedCalls.length - 1].headers[name] = value;
            }
        } catch(e) {}
        
        console.log("📊 Captured: " + method + " " + url);
        console.log("📊 Total captured: " + capturedCalls.length);
        
        return this.proceed(request);
    };
    console.log("✅ Data capture started!");
});

# Interactive token extraction
Java.perform(function() {
    console.log("🔍 Searching for tokens in SharedPreferences...");
    
    try {
        var ActivityThread = Java.use("android.app.ActivityThread");
        var currentActivityThread = ActivityThread.currentApplication();
        var context = currentActivityThread.getApplicationContext();
        
        var prefs = context.getSharedPreferences("com.shopee.id_preferences", 0);
        var all = prefs.getAll();
        var entries = all.entrySet().iterator();
        
        while (entries.hasNext()) {
            var entry = entries.next();
            var key = entry.getKey();
            var value = entry.getValue();
            
            if (key && value) {
                var valueStr = value.toString();
                if (valueStr.length > 10) {
                    var lowerKey = key.toLowerCase();
                    if (lowerKey.includes("token") || 
                        lowerKey.includes("auth") ||
                        lowerKey.includes("session") ||
                        lowerKey.includes("device") ||
                        lowerKey.includes("access") ||
                        lowerKey.includes("refresh")) {
                        console.log("🔑 " + key + " = " + valueStr.substring(0, 50) + "...");
                    }
                }
            }
        }
    } catch(e) {
        console.log("⚠️ Error searching preferences: " + e);
    }
});

# Since the token grabber is working but the classes have changed, let's focus on capturing tokens from network traffic:
Java.perform(function() {
    console.log("🔍 Capturing network headers for tokens...");
    
    var RealInterceptorChain = Java.use("okhttp3.internal.http.RealInterceptorChain");
    RealInterceptorChain.proceed.overload('okhttp3.Request').implementation = function(request) {
        var url = request.url().toString();
        var headers = request.headers();
        
        console.log("\n📤 " + request.method() + " " + url);
        for (var i = 0; i < headers.size(); i++) {
            var name = headers.name(i);
            var value = headers.value(i);
            
            if (name.toLowerCase().includes("authorization") || 
                name.toLowerCase().includes("token") ||
                name.toLowerCase().includes("bearer") ||
                name.toLowerCase().includes("x-") && value.length > 20) {
                console.log("🔑 " + name + ": " + value);
            } else {
                console.log("  " + name + ": " + value);
            }
        }
        
        return this.proceed(request);
    };
    console.log("✅ Network header capture started!");
});
```

## 🎥 Demo Video

https://github.com/user-attachments/assets/20e3343a-8fcb-4cfb-be3c-252d7eb2574c
