#!/bin/bash

# Shopee Mobile API Interceptor - Complete Setup Script

echo "🚀 Setting up Shopee Mobile API Interceptor..."
echo "================================================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+"
    exit 1
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p data logs apk-analysis captured-traffic device-farm-data
mkdir -p apk-analysis/reports apk-analysis/decompiled apk-analysis/classes

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build project
echo "🏗️ Building project..."
npm run build

# Setup Frida (optional)
echo "🔧 Setting up Frida (optional)..."
read -p "Do you want to set up Frida? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run setup:frida
fi

# Create .env file
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
fi

echo ""
echo "✅ Setup completed!"
echo ""
echo "📖 Quick Start:"
echo "  1. Place your Shopee APK in the project root"
echo "  2. Run: npm run analyze-apk -- -a ./shopee.apk"
echo "  3. Run: npm run capture-traffic"
echo "  4. Run: npm run extract-tokens"
echo "  5. Run: npm run deploy-device-farm"
echo ""
echo "📚 For more information, see README.md"