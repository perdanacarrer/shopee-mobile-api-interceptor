// Frida script to intercept API calls
Java.perform(function() {
    console.log("[*] API Hook starting...");

    // Hook OkHttp Request.Builder
    var RequestBuilder = Java.use('okhttp3.Request$Builder');
    RequestBuilder.url.overload('okhttp3.HttpUrl')
        .implementation = function(url) {
            console.log("[*] Request URL: " + url.toString());
            return this.url(url);
        };

    RequestBuilder.addHeader.overload('java.lang.String', 'java.lang.String')
        .implementation = function(name, value) {
            console.log("[*] Header: " + name + " = " + value);
            return this.addHeader(name, value);
        };

    // Hook network calls
    var Call = Java.use('okhttp3.Call');
    Call.execute.implementation = function() {
        console.log("[*] Call.execute() intercepted");
        var response = this.execute();
        return response;
    };

    // Hook specific Shopee API endpoints
    var ShopeeAPI = Java.use('com.shopee.ShopeeAPI');
    var methods = ShopeeAPI.class.getDeclaredMethods();
    methods.forEach(function(method) {
        var methodName = method.getName();
        if (methodName.includes('getProduct') || methodName.includes('search')) {
            console.log("[*] Found Shopee API method: " + methodName);
            // Add hook for this method
            try {
                var methodHook = ShopeeAPI[methodName];
                methodHook.implementation = function() {
                    console.log("[*] API call: " + methodName);
                    console.log("[*] Arguments: " + JSON.stringify(arguments));
                    return methodHook.apply(this, arguments);
                };
            } catch (e) {
                console.log("[*] Could not hook method: " + methodName);
            }
        }
    });

    console.log("[*] API Hook loaded successfully!");
});