package de.charavision.sonntagsfragen;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Environment;
import android.graphics.Insets;
import android.graphics.Bitmap;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public class MainActivity extends Activity {
    private static final String APP_VERSION = "1.0.18";
    private static final String WEB_URL = "https://charavision.github.io/SonntagsfrageView/";
    private WebView webView;
    private volatile boolean webSurfaceReady = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(android.graphics.Color.rgb(6, 16, 32));
        webView = new WebView(this);
        FrameLayout.LayoutParams webLayout = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        );
        frame.addView(webView, webLayout);
        setContentView(frame);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            frame.setOnApplyWindowInsetsListener((view, windowInsets) -> {
                Insets systemBars = windowInsets.getInsets(WindowInsets.Type.systemBars());
                webLayout.topMargin = systemBars.top;
                webLayout.bottomMargin = systemBars.bottom;
                webLayout.leftMargin = systemBars.left;
                webLayout.rightMargin = systemBars.right;
                webView.setLayoutParams(webLayout);
                return windowInsets;
            });
        }
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                webSurfaceReady = false;
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                webSurfaceReady = true;
                super.onPageCommitVisible(view, url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setUserAgentString(webView.getSettings().getUserAgentString() + " SonntagsfragenApp/" + APP_VERSION);
        webView.addJavascriptInterface(new AppBridge(), "AndroidApp");
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setBuiltInZoomControls(false);
        webView.getSettings().setDisplayZoomControls(false);
        webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.clearCache(true);
        webView.setBackgroundColor(android.graphics.Color.rgb(6, 16, 32));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        loadCurrentWebApp("startup");
    }

    public class AppBridge {
        @JavascriptInterface
        public void installUpdate(String url) {
            if (url == null || !url.startsWith("https://github.com/charavision/SonntagsfrageView/")) return;
            runOnUiThread(() -> downloadAndInstall(url));
        }

        @JavascriptInterface
        public void refreshIntro() {
            runOnUiThread(() -> {
                webView.stopLoading();
                webView.clearCache(true);
                webView.clearHistory();
                loadCurrentWebApp("intro");
            });
        }

        @JavascriptInterface
        public void downloadFile(String url, String filename) {
            if (url == null || !url.startsWith("https://github.com/charavision/SonntagsfrageView/")) return;
            String safeName = filename == null ? "Sonntagsfragen-Download" : filename.replaceAll("[^A-Za-z0-9._-]", "_");
            runOnUiThread(() -> {
                DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle(safeName);
                request.setDescription("Sonntagsfragen-Datei wird heruntergeladen.");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(MainActivity.this, Environment.DIRECTORY_DOWNLOADS, safeName);
                manager.enqueue(request);
            });
        }

        @JavascriptInterface
        public boolean isSurfaceReady() {
            return webSurfaceReady;
        }
    }

    private void loadCurrentWebApp(String reason) {
        webSurfaceReady = false;
        webView.loadUrl(WEB_URL + "?appVersion=" + APP_VERSION + "&refresh=" + reason + "-" + System.currentTimeMillis());
    }

    private void downloadAndInstall(String url) {
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("Sonntagsfragen-Update");
        request.setDescription("Die neue App-Version wird heruntergeladen.");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setMimeType("application/vnd.android.package-archive");
        request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "Sonntagsfragen-Update.apk");
        final long downloadId = manager.enqueue(request);
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != downloadId) return;
                unregisterReceiver(this);
                Uri apk = manager.getUriForDownloadedFile(downloadId);
                if (apk == null) return;
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(apk, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(install);
            }
        };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
