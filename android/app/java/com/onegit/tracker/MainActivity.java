package com.onegit.tracker;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.Manifest;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * GitHub Tracker — thin WebView host around the bundled web app.
 *
 * The only native pieces are: theming the system bars, opening links in the
 * browser, the clipboard, and a plain HTTPS GET bridge. The bridge exists
 * because github.com sends no CORS headers — fetching its public pages and
 * Atom feeds from the page itself would be blocked. Everything it fetches is
 * ordinary public HTML/XML: no GitHub API, no tokens, no API quota.
 */
public class MainActivity extends Activity {

    private static final String INDEX = "file:///android_asset/www/index.html";
    /* the same UA the page parsers were built and tested against */
    private static final String UA =
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    private static final int MAX_BYTES = 4 * 1024 * 1024;

    private static final int REQ_STORE = 81;
    private static final int REQ_NOTIF = 82;
    private static final String CHANNEL_ID = "gh_updates";

    private WebView web;
    private BroadcastReceiver dlReceiver;
    private String pendingDlUrl, pendingDlName;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= 26) {
            web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_BOUND, true);
        }
        web.setBackgroundColor(Color.parseColor("#F2F2F2"));
        web.addJavascriptInterface(new Bridge(), "Tracker");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    openExternal(u);
                    return true;
                }
                return false;
            }
        });

        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        registerDownloadReceiver();
        setupPredictiveBack();
        web.loadUrl(INDEX);
        maybeWidgetRefresh(getIntent());
    }

    private void openExternal(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) { }
    }

    private void evalJs(final String js) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                try { web.evaluateJavascript(js, null); } catch (Throwable ignored) { }
            }
        });
    }

    /* The back gesture, the hardware key and three-button nav all land here.
       The page decides first: close a panel, leave a detail screen, go Home,
       and only then does Android leave the app. */
    /** Back (button or gesture) always asks the page first: it steps back through
     *  the app's own history and only closes when there is nothing left. */
    private void handleBack() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("(window.__onBack && window.__onBack()) ? '1' : '0'", value -> {
            if (value == null || !value.contains("1")) finish();
        });
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    /** Android 13+ predictive back goes through OnBackInvokedCallback, not onBackPressed. */
    private void setupPredictiveBack() {
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                new android.window.OnBackInvokedCallback() {
                    @Override public void onBackInvoked() { handleBack(); }
                });
        } catch (Throwable ignored) { }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        maybeWidgetRefresh(intent);
    }

    /** A widget's refresh button opened us: let the page run a real sync. */
    private void maybeWidgetRefresh(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("widget_refresh", false)) return;
        intent.removeExtra("widget_refresh");
        if (web == null) return;
        web.postDelayed(new Runnable() {
            @Override public void run() {
                evalJs("window.__widgetRefresh&&window.__widgetRefresh()");
            }
        }, 900);
    }

    /** Keep the WebView's timers and visibility state honest so the live sync
     *  loop resumes the moment the app comes back to the foreground. */
    @Override
    protected void onResume() {
        super.onResume();
        try {
            if (web != null) { web.onResume(); web.resumeTimers(); }
        } catch (Throwable ignored) { }
    }

    @Override
    protected void onPause() {
        try {
            if (web != null) web.onPause();
        } catch (Throwable ignored) { }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        try { if (dlReceiver != null) unregisterReceiver(dlReceiver); } catch (Throwable ignored) { }
        dlReceiver = null;
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /* ===================== downloads ===================== */

    private void registerDownloadReceiver() {
        dlReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                if (i == null || !DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(i.getAction())) return;
                long id = i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                String title = "";
                boolean ok = false;
                try {
                    DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    android.database.Cursor cur = dm.query(new DownloadManager.Query().setFilterById(id));
                    if (cur != null) {
                        if (cur.moveToFirst()) {
                            int st = cur.getInt(cur.getColumnIndex(DownloadManager.COLUMN_STATUS));
                            int ti = cur.getColumnIndex(DownloadManager.COLUMN_TITLE);
                            title = ti >= 0 ? cur.getString(ti) : "";
                            ok = st == DownloadManager.STATUS_SUCCESSFUL;
                        }
                        cur.close();
                    }
                } catch (Throwable ignored) { }
                evalJs("window.__dlDone&&__dlDone(" + ok + "," + JSONObject.quote(title == null ? "" : title) + ")");
            }
        };
        IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        try {
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(dlReceiver, f, Context.RECEIVER_EXPORTED);
            else registerReceiver(dlReceiver, f);
        } catch (Throwable ignored) { }
    }

    private void requestDownload(String url, String name) {
        pendingDlUrl = url;
        pendingDlName = name;
        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ Manifest.permission.WRITE_EXTERNAL_STORAGE }, REQ_STORE);
            return;
        }
        startDownload(url, name);
    }

    private void startDownload(final String url, final String name) {
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    String safe = sanitizeName(name);
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setTitle(safe);
                    req.setDescription("GitHub Tracker");
                    req.setMimeType(mimeFor(safe));
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safe);
                    DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    if (dm == null) throw new IllegalStateException("no download manager");
                    dm.enqueue(req);
                    evalJs("window.__dl&&__dl(true," + JSONObject.quote(safe) + ",'')");
                } catch (Throwable e) {
                    String m = e.getMessage() == null ? "download failed" : e.getMessage();
                    evalJs("window.__dl&&__dl(false," + JSONObject.quote(name == null ? "" : name)
                            + "," + JSONObject.quote(m) + ")");
                }
            }
        }).start();
    }

    private static String sanitizeName(String name) {
        String n = (name == null || name.trim().isEmpty()) ? "github-file" : name.trim();
        n = n.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (n.length() > 120) n = n.substring(n.length() - 120);
        return n;
    }

    private static String mimeFor(String n) {
        String s = n.toLowerCase();
        if (s.endsWith(".apk")) return "application/vnd.android.package-archive";
        if (s.endsWith(".zip")) return "application/zip";
        if (s.endsWith(".tar.gz") || s.endsWith(".tgz")) return "application/gzip";
        if (s.endsWith(".txt") || s.endsWith(".md")) return "text/plain";
        if (s.endsWith(".png")) return "image/png";
        if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        if (req == REQ_STORE) {
            boolean ok = res != null && res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            if (ok) startDownload(pendingDlUrl, pendingDlName);
            else evalJs("window.__dl&&__dl(false," + JSONObject.quote(pendingDlName == null ? "" : pendingDlName)
                    + ",'storage permission denied')");
            pendingDlUrl = null;
            pendingDlName = null;
            return;
        }
        if (req == REQ_NOTIF) {
            boolean ok = res != null && res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            if (ok) ensureChannel();
            evalJs("window.__notifPerm&&__notifPerm(" + ok + ")");
            return;
        }
        super.onRequestPermissionsResult(req, perms, res);
    }

    /* ===================== notifications ===================== */

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "GitHub updates",
                    NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Commits, releases and activity from accounts you follow");
            nm.createNotificationChannel(ch);
        }
    }

    private void postNotification(String title, String body, String tag) {
        try {
            if (Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                return;
            }
            ensureChannel();
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;

            Intent open = new Intent(this, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int pflags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) pflags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(this, 0, open, pflags);

            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(this, CHANNEL_ID);
            else b = new Notification.Builder(this);
            b.setContentTitle(title == null ? "GitHub Tracker" : title)
             .setContentText(body == null ? "" : body)
             .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
             .setSmallIcon(R.drawable.ic_stat)
             .setAutoCancel(true)
             .setContentIntent(pi);

            String t = (tag == null || tag.isEmpty()) ? "gh" : tag;
            nm.notify(t, (int) (System.currentTimeMillis() & 0x7fffffff), b.build());
        } catch (Throwable ignored) { }
    }

    /* ===================== native bridge ===================== */
    private class Bridge {

        /** Restyle the Android status/navigation bars to match the app theme. */
        @JavascriptInterface
        public void theme(final String barColor, final boolean lightIcons) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    try {
                        int c = Color.parseColor(barColor);
                        getWindow().setStatusBarColor(c);
                        getWindow().setNavigationBarColor(c);
                        web.setBackgroundColor(c);
                        View d = getWindow().getDecorView();
                        int f = d.getSystemUiVisibility();
                        if (lightIcons) f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        else f &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        if (Build.VERSION.SDK_INT >= 26) {
                            if (lightIcons) f |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                            else f &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                        }
                        d.setSystemUiVisibility(f);
                    } catch (Throwable ignored) { }
                }
            });
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            if (url == null || !url.startsWith("http")) return;
            runOnUiThread(new Runnable() {
                @Override public void run() { openExternal(Uri.parse(url)); }
            });
        }

        @JavascriptInterface
        public void copy(final String text) {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("GitHub Tracker", text));
            } catch (Exception ignored) { }
        }

        /** In-app download: the file lands in Downloads, with a progress notification. */
        @JavascriptInterface
        public void download(final String url, final String name) {
            if (url == null || !url.startsWith("http")) return;
            runOnUiThread(new Runnable() {
                @Override public void run() { requestDownload(url, name); }
            });
        }

        /** Asks for POST_NOTIFICATIONS on Android 13+; answer comes back on window.__notifPerm. */
        @JavascriptInterface
        public void askNotifications() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    try {
                        if (Build.VERSION.SDK_INT >= 33
                                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                                    != PackageManager.PERMISSION_GRANTED) {
                            requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIF);
                            return;
                        }
                        ensureChannel();
                        evalJs("window.__notifPerm&&__notifPerm(true)");
                    } catch (Throwable ignored) { }
                }
            });
        }

        /** The page pushes one JSON snapshot after every sync; the home screen
         *  widgets paint from it. */
        @JavascriptInterface
        public void widgetSync(final String json) {
            try {
                WidgetData.setSnapshot(MainActivity.this, json);
                WidgetData.refreshAll(MainActivity.this);
            } catch (Throwable ignored) { }
        }

        /** Posts one live-update notification. */
        @JavascriptInterface
        public void notify(final String title, final String body, final String tag) {
            runOnUiThread(new Runnable() {
                @Override public void run() { postNotification(title, body, tag); }
            });
        }

        /**
         * Plain HTTPS GET. The page calls raw(url, jid) and the body comes back on
         * window.__raw(jid, ok, text). Runs off the UI thread, so the page never blocks.
         */
        @JavascriptInterface
        public void raw(final String url, final String jid) {
            new Thread(new Runnable() {
                @Override public void run() {
                    final String q = JSONObject.quote(jid);
                    HttpURLConnection c = null;
                    try {
                        c = (HttpURLConnection) new URL(url).openConnection();
                        c.setRequestMethod("GET");
                        c.setInstanceFollowRedirects(true);
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(25000);
                        c.setRequestProperty("User-Agent", UA);
                        c.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
                        c.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
                        int code = c.getResponseCode();
                        if (code < 200 || code >= 300) {
                            throw new Exception("HTTP " + code);
                        }
                        InputStream in = c.getInputStream();
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        byte[] buf = new byte[16384];
                        int n, total = 0;
                        while ((n = in.read(buf)) > 0) {
                            total += n;
                            if (total > MAX_BYTES) break;
                            bo.write(buf, 0, n);
                        }
                        in.close();
                        String text = bo.toString("UTF-8");
                        evalJs("window.__raw&&__raw(" + q + ",true," + JSONObject.quote(text) + ")");
                    } catch (Throwable e) {
                        String m = e.getMessage() == null ? "request failed" : e.getMessage();
                        evalJs("window.__raw&&__raw(" + q + ",false," + JSONObject.quote(m) + ")");
                    } finally {
                        if (c != null) c.disconnect();
                    }
                }
            }).start();
        }
    }
}
