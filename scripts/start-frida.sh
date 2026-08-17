#!/bin/bash
# Complete Frida setup - run this if the npm script fails

echo "🚀 Complete Frida Setup"
echo "========================"

# 1. Check device
echo "📱 Checking device..."
if ! adb devices | grep -q "emulator-5554"; then
    echo "❌ No device found. Start an emulator first."
    exit 1
fi
echo "✅ Device found"

# 2. Push Frida server (if not already pushed)
if ! adb shell "[ -f /data/local/tmp/frida-server ]" 2>/dev/null; then
    echo "📤 Pushing Frida server..."
    # Check if local frida-server exists
    if [ ! -f "./frida-server" ]; then
        echo "❌ frida-server not found locally"
        echo "Download from: https://github.com/frida/frida/releases"
        exit 1
    fi
    adb push ./frida-server /data/local/tmp/
    adb shell chmod 755 /data/local/tmp/frida-server
fi

# 3. Kill existing Frida
echo "🔄 Restarting Frida..."
adb shell "killall frida-server" 2>/dev/null || true

# 4. Start Frida
echo "▶️ Starting Frida server..."
adb shell "nohup /data/local/tmp/frida-server > /dev/null 2>&1 &"
sleep 2

# 5. Forward ports
echo "🔌 Forwarding ports..."
adb forward tcp:27042 tcp:27042
adb forward tcp:27043 tcp:27043

# 6. Verify
echo "✅ Verifying..."
if frida-ps -U 2>/dev/null | grep -q "PID"; then
    echo "🎉 Frida is working!"
    frida-ps -U | head -10
else
    echo "⚠️ Frida not responding. Try: frida-ps -U"
fi

echo ""
echo "✅ Setup complete!"