// Frida script to extract authentication tokens
Java.perform(function() {
    console.log("[*] Token Grabber starting...");

    // Hook SharedPreferences to get stored tokens
    var SharedPreferences = Java.use('android.content.SharedPreferences');
    SharedPreferences.getString.overload('java.lang.String', 'java.lang.String')
        .implementation = function(key, defValue) {
            var value = this.getString(key, defValue);
            if (key.includes('token') || key.includes('auth')) {
                console.log("[*] Token found: " + key + " = " + value);
                // Send token to host
                send({
                    type: 'token',
                    key: key,
                    value: value
                });
            }
            return value;
        };

    // Hook authentication responses
    var AuthResponse = Java.use('com.shopee.auth.AuthResponse');
    var authMethods = AuthResponse.class.getDeclaredMethods();
    authMethods.forEach(function(method) {
        var methodName = method.getName();
        if (methodName.includes('getAccessToken') || 
            methodName.includes('getRefreshToken') ||
            methodName.includes('getDeviceToken')) {
            
            try {
                var methodHook = AuthResponse[methodName];
                methodHook.implementation = function() {
                    var value = methodHook.apply(this, arguments);
                    console.log("[*] Token extracted: " + methodName + " = " + value);
                    
                    send({
                        type: 'token_extracted',
                        method: methodName,
                        value: value
                    });
                    
                    return value;
                };
            } catch (e) {
                console.log("[*] Could not hook auth method: " + methodName);
            }
        }
    });

    console.log("[*] Token Grabber loaded successfully!");
});