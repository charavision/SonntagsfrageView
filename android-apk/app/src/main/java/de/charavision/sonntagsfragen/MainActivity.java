package de.charavision.sonntagsfragen;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String APP_VERSION = "1.0.24";
    private static final String WEB_URL = "https://charavision.github.io/SonntagsfrageView/";
    private static final String[] NOTIFICATION_REGIONS = {"Bundestag", "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen", "Hamburg", "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen", "Rheinland-Pfalz", "Saarland", "Sachsen", "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen"};
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
        SharedPreferences notificationPreferences = getSharedPreferences(NotificationJobService.PREFERENCES, MODE_PRIVATE);
        boolean notificationsEnabled = notificationPreferences.getBoolean("enabled", false);
        NotificationJobService.schedule(this, notificationsEnabled);
        if (notificationsEnabled && Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4201);
        }
        loadCurrentWebApp("startup");
    }

    public class AppBridge {
        @JavascriptInterface
        public void installUpdate(String url) {
            if (url == null || !url.startsWith("https://github.com/charavision/SonntagsfrageView/")) return;
            runOnUiThread(() -> downloadUpdate(url));
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

        @JavascriptInterface
        public String getNotificationSettings() {
            SharedPreferences preferences = getSharedPreferences(NotificationJobService.PREFERENCES, MODE_PRIVATE);
            Set<String> regions = preferences.getStringSet("regions", null);
            if (regions == null) {
                regions = new HashSet<>();
                java.util.Collections.addAll(regions, NOTIFICATION_REGIONS);
            }
            try {
                JSONObject result = new JSONObject();
                result.put("enabled", preferences.getBoolean("enabled", false));
                result.put("polls", preferences.getBoolean("polls", true));
                result.put("system", preferences.getBoolean("system", true));
                result.put("regions", new JSONArray(regions));
                return result.toString();
            } catch (Exception error) { return "{}"; }
        }

        @JavascriptInterface
        public void saveNotificationSettings(String json) {
            try {
                JSONObject input = new JSONObject(json == null ? "{}" : json);
                boolean enabled = input.optBoolean("enabled", false);
                JSONArray selected = input.optJSONArray("regions");
                Set<String> regions = new HashSet<>();
                if (selected != null) for (int index = 0; index < selected.length(); index += 1) {
                    String region = selected.optString(index, "");
                    for (String allowed : NOTIFICATION_REGIONS) if (allowed.equals(region)) regions.add(region);
                }
                getSharedPreferences(NotificationJobService.PREFERENCES, MODE_PRIVATE).edit()
                    .putBoolean("enabled", enabled)
                    .putBoolean("polls", input.optBoolean("polls", true))
                    .putBoolean("system", input.optBoolean("system", true))
                    .putStringSet("regions", regions)
                    .apply();
                runOnUiThread(() -> {
                    if (enabled && Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4201);
                    }
                    NotificationJobService.schedule(MainActivity.this, enabled);
                });
            } catch (Exception ignored) { }
        }
    }

    private void loadCurrentWebApp(String reason) {
        webSurfaceReady = false;
        webView.loadUrl(WEB_URL + "?appVersion=" + APP_VERSION + "&refresh=" + reason + "-" + System.currentTimeMillis());
    }

    private void downloadUpdate(String url) {
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("Sonntagsfragen-Update");
        request.setDescription("Nach dem Download bitte über Eigene Dateien installieren.");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setMimeType("application/vnd.android.package-archive");
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Sonntagsfragen-Update.apk");
        manager.enqueue(request);
        android.widget.Toast.makeText(this, "Update wird in Downloads gespeichert.", android.widget.Toast.LENGTH_LONG).show();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
