Java.perform(function() {
    console.log("🔑 Token Grabber v2 starting...");
    
    // Hook SharedPreferences to capture tokens
    try {
        var SharedPreferences = Java.use("android.content.SharedPreferences");
        var Editor = Java.use("android.content.SharedPreferences$Editor");
        
        // Hook getString
        SharedPreferences.getString.overload('java.lang.String', 'java.lang.String').implementation = function(key, defValue) {
            var value = this.getString(key, defValue);
            if (value && value.length > 10) {
                var lowerKey = key.toLowerCase();
                if (lowerKey.includes("token") || 
                    lowerKey.includes("auth") ||
                    lowerKey.includes("session") ||
                    lowerKey.includes("device") ||
                    lowerKey.includes("access") ||
                    lowerKey.includes("refresh") ||
                    lowerKey.includes("bearer")) {
                    console.log("🔑 FOUND TOKEN: " + key + " = " + value.substring(0, 50) + "...");
                    send({
                        type: "token",
                        key: key,
                        value: value
                    });
                }
            }
            return value;
        };
        console.log("✅ SharedPreferences hooked!");
    } catch(e) {
        console.log("⚠️ SharedPreferences hook failed: " + e);
    }
    
    // Hook OkHttp requests to capture Authorization headers
    try {
        var RealInterceptorChain = Java.use("okhttp3.internal.http.RealInterceptorChain");
        RealInterceptorChain.proceed.overload('okhttp3.Request').implementation = function(request) {
            var headers = request.headers();
            var authHeader = null;
            
            // Check for Authorization header
            for (var i = 0; i < headers.size(); i++) {
                var name = headers.name(i);
                var value = headers.value(i);
                if (name.toLowerCase().includes("authorization") || 
                    name.toLowerCase().includes("token") ||
                    name.toLowerCase().includes("bearer")) {
                    console.log("🔑 AUTH HEADER: " + name + " = " + value.substring(0, 50) + "...");
                    authHeader = {name: name, value: value};
                    send({
                        type: "auth_header",
                        name: name,
                        value: value
                    });
                }
            }
            
            return this.proceed(request);
        };
        console.log("✅ Request hook installed!");
    } catch(e) {
        console.log("⚠️ Request hook failed: " + e);
    }
    
    // Hook SharedPreferences.Editor to capture token writes
    try {
        var Editor = Java.use("android.content.SharedPreferences$Editor");
        Editor.putString.overload('java.lang.String', 'java.lang.String').implementation = function(key, value) {
            if (value && value.length > 10) {
                var lowerKey = key.toLowerCase();
                if (lowerKey.includes("token") || 
                    lowerKey.includes("auth") ||
                    lowerKey.includes("session") ||
                    lowerKey.includes("device") ||
                    lowerKey.includes("access") ||
                    lowerKey.includes("refresh")) {
                    console.log("💾 TOKEN SAVED: " + key + " = " + value.substring(0, 50) + "...");
                    send({
                        type: "token_saved",
                        key: key,
                        value: value
                    });
                }
            }
            return this.putString(key, value);
        };
        console.log("✅ Editor hook installed!");
    } catch(e) {
        console.log("⚠️ Editor hook failed: " + e);
    }
    
    console.log("🚀 Token grabber ready! Interact with Shopee to capture tokens.");
});

// Message handler for sending data back
recv('token', function(data) {
    console.log("📦 Received token: " + JSON.stringify(data));
});

recv('auth_header', function(data) {
    console.log("📦 Received auth header: " + JSON.stringify(data));
});
