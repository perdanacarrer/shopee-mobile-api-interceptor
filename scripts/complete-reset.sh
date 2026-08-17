#!/bin/bash

echo "🔧 Complete emulator reset..."

# Step 1: Kill everything
echo "1. Killing all processes..."
pkill -f emulator 2>/dev/null
adb kill-server 2>/dev/null
pkill -f adb 2>/dev/null

# Step 2: Clean up
echo "2. Cleaning up..."
rm -f ~/.android/avd/*.lock 2>/dev/null
rm -rf /tmp/android-* 2>/dev/null

# Step 3: Wait
echo "3. Waiting..."
sleep 5

# Step 4: Start ADB
echo "4. Starting ADB..."
adb start-server

# Step 5: Start emulator fresh
echo "5. Starting emulator (this may take a minute)..."
emulator -avd "Small_Phone_API_VanillaIceCream_2" -no-audio -wipe-data -no-snapshot -gpu host &

# Step 6: Wait for boot
echo "⏳ Waiting for emulator to boot..."
adb wait-for-device
sleep 10

# Step 7: Check connection
echo ""
echo "📱 Device status:"
adb devices

# Step 8: Test connection
echo ""
echo "🔍 Testing connection..."
if adb shell getprop ro.product.model 2>/dev/null; then
    echo "✅ Emulator is online!"
    echo ""
    echo "📱 Model: $(adb shell getprop ro.product.model)"
    echo "📱 Android: $(adb shell getprop ro.build.version.release)"
    
    # Start Frida
    echo ""
    echo "🔄 Starting Frida..."
    adb shell "killall frida-server" 2>/dev/null
    adb shell "/data/local/tmp/frida-server &"
    sleep 2
    adb forward tcp:27042 tcp:27042
    
    echo "✅ Frida ready!"
    frida-ps -U | head -5
else
    echo "❌ Emulator still offline"
    echo ""
    echo "Try manual steps:"
    echo "1. Open Android Studio"
    echo "2. Go to AVD Manager"
    echo "3. Delete the emulator and create a new one"
    echo "4. Or try: emulator -avd Pixel_5_API_33 -no-audio"
fi
