// Frida script to bypass SSL pinning
Java.perform(function() {
    console.log("[*] SSL Kill Switch starting...");

    // Bypass SSL pinning for various SSL implementations
    var SSLContext = Java.use('javax.net.ssl.SSLContext');
    SSLContext.init.overload(
        '[Ljavax.net.ssl.KeyManager;',
        '[Ljavax.net.ssl.TrustManager;',
        'java.security.SecureRandom'
    ).implementation = function(keyManagers, trustManagers, secureRandom) {
        console.log("[*] SSLContext.init called, bypassing pinning...");
        
        // Create custom trust manager
        var TrustManager = Java.use('javax.net.ssl.X509TrustManager');
        var customTrustManager = Java.registerClass({
            name: 'com.shopee.CustomTrustManager',
            implements: [TrustManager],
            methods: {
                checkClientTrusted: function(chain, authType) {
                    console.log("[*] checkClientTrusted bypassed");
                },
                checkServerTrusted: function(chain, authType) {
                    console.log("[*] checkServerTrusted bypassed");
                },
                getAcceptedIssuers: function() {
                    return [];
                }
            }
        });

        var trustManagersArray = Java.array('javax.net.ssl.X509TrustManager', [
            customTrustManager.$new()
        ]);

        return this.init(keyManagers, trustManagersArray, secureRandom);
    };

    // Bypass HostnameVerifier
    var HostnameVerifier = Java.use('javax.net.ssl.HostnameVerifier');
    HostnameVerifier.verify.implementation = function(hostname, session) {
        console.log("[*] HostnameVerifier.verify called for: " + hostname);
        return true;
    };

    // Hook OkHttp SSL pinning
    var OkHttpClient = Java.use('okhttp3.OkHttpClient');
    OkHttpClient.Builder.build.implementation = function() {
        console.log("[*] OkHttpClient.Builder.build called, bypassing pinning...");
        var builder = this.build();
        return builder;
    };

    // Hook CertificatePinner
    var CertificatePinner = Java.use('okhttp3.CertificatePinner');
    CertificatePinner.check.overload('java.lang.String', '[Ljava.security.cert.Certificate;')
        .implementation = function(hostname, certificates) {
            console.log("[*] CertificatePinner.check bypassed for: " + hostname);
            return;
        };

    console.log("[*] SSL Kill Switch loaded successfully!");
});