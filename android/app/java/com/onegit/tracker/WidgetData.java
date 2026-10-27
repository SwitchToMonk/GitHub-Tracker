package com.onegit.tracker;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/** Shared store for the home screen widgets: the page pushes one JSON snapshot
 *  here after every sync and each widget paints from it, so a widget is never
 *  blank even if a refresh fails. */
final class WidgetData {

    static final String PREF = "widgetcache";

    private WidgetData() { }

    static SharedPreferences sp(Context c) {
        return c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    static String snapshot(Context c) {
        try { return sp(c).getString("snap", "{}"); } catch (Throwable t) { return "{}"; }
    }

    static void setSnapshot(Context c, String json) {
        try { sp(c).edit().putString("snap", json == null ? "{}" : json).apply(); } catch (Throwable ignored) { }
    }

    static void refreshAll(Context c) {
        Context a = c.getApplicationContext();
        try { UpdatesWidget.updateAll(a); } catch (Throwable ignored) { }
        try { ReleasesWidget.updateAll(a); } catch (Throwable ignored) { }
        try { ContribWidget.updateAll(a); } catch (Throwable ignored) { }
    }

    static boolean isPitch(Context c) {
        try { return new org.json.JSONObject(snapshot(c)).optBoolean("pitch", false); } catch (Throwable t) { return false; }
    }

    /** pitch black wins over light/dark, so the widgets can match an OLED theme */
    static int bgFor(Context c) {
        if (isPitch(c)) return R.drawable.widget_bg_pitch;
        return isLight(c) ? R.drawable.widget_bg_light : R.drawable.widget_bg;
    }

    static boolean isLight(Context c) {
        try {
            return "light".equals(new org.json.JSONObject(snapshot(c)).optString("theme", "dark"));
        } catch (Throwable t) { return false; }
    }

    static int accent(Context c) {
        try {
            String a = new org.json.JSONObject(snapshot(c)).optString("accent", "#1B6EF3");
            return android.graphics.Color.parseColor(a);
        } catch (Throwable t) { return 0xFF1B6EF3; }
    }

    static PendingIntent openApp(Context c, int req) {
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int fl = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) fl |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(c, req, i, fl);
    }

    /** widget refresh button: repaint from cache, then ask the app to re-sync */
    static PendingIntent refreshIntent(Context c, int req) {
        Intent i = new Intent(c, UpdatesWidget.class);
        i.setAction(UpdatesWidget.ACTION_REFRESH);
        int fl = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) fl |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(c, req, i, fl);
    }
}
