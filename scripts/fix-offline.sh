#!/bin/bash

echo "🔧 Fixing offline emulator..."

# Kill everything
echo "Killing ADB and emulator..."
adb kill-server
pkill -f emulator
pkill -f adb

# Wait
sleep 3

# Clean locks
rm -f ~/.android/avd/*.lock 2>/dev/null

# Start ADB
echo "Starting ADB..."
adb start-server

# Start emulator
echo "Starting emulator..."
emulator -avd "Small_Phone_API_VanillaIceCream_2" -no-audio -no-snapshot &

echo "⏳ Waiting for emulator to boot..."
adb wait-for-device
sleep 5

# Check
echo ""
echo "📱 Device status:"
adb devices

# Get device info
echo ""
echo "📱 Device model:"
adb shell getprop ro.product.model 2>/dev/null || echo "Still booting..."

echo ""
echo "✅ Done!"
