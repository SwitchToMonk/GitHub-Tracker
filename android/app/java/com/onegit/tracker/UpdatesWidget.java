package com.onegit.tracker;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Home screen widget: the latest commits, releases and new repos. */
public class UpdatesWidget extends AppWidgetProvider {

    static final String ACTION_REFRESH = "com.onegit.tracker.WIDGET_REFRESH";
    private static final int MAX_ROWS = 4;

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    @Override public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (i != null && ACTION_REFRESH.equals(i.getAction())) {
            WidgetData.refreshAll(c);
            try {
                Intent open = new Intent(c, MainActivity.class);
                open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                open.putExtra("widget_refresh", true);
                c.startActivity(open);
            } catch (Throwable ignored) { }
        }
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, UpdatesWidget.class));
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static RemoteViews build(Context c) {
        boolean light = WidgetData.isLight(c);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_updates);
        rv.setInt(R.id.w_root, "setBackgroundResource", WidgetData.bgFor(c));
        rv.removeAllViews(R.id.w_rows);

        JSONArray rows = new JSONArray();
        try { rows = new JSONObject(WidgetData.snapshot(c)).optJSONArray("updates"); } catch (Throwable ignored) { }
        if (rows == null) rows = new JSONArray();

        if (rows.length() == 0) {
            rv.addView(R.id.w_rows, rowViews(c, "No updates yet", "Open the app to sync", false, light));
            rv.setTextViewText(R.id.w_sub, "not synced yet");
        } else {
            for (int i = 0; i < Math.min(MAX_ROWS, rows.length()); i++) {
                JSONObject o = rows.optJSONObject(i);
                if (o == null) continue;
                rv.addView(R.id.w_rows, rowViews(c, o.optString("t"), o.optString("s"),
                        "release".equals(o.optString("k")), light));
            }
            rv.setTextViewText(R.id.w_sub, rows.length() + " changes · live");
        }
        rv.setOnClickPendingIntent(R.id.w_refresh, WidgetData.refreshIntent(c, 11));
        rv.setOnClickPendingIntent(R.id.w_root, WidgetData.openApp(c, 12));
        return rv;
    }

    static RemoteViews rowViews(Context c, String title, String sub, boolean release, boolean light) {
        RemoteViews r = new RemoteViews(c.getPackageName(), R.layout.widget_row);
        r.setTextViewText(R.id.wr_title, title == null ? "" : title);
        r.setTextViewText(R.id.wr_sub, sub == null ? "" : sub);
        r.setInt(R.id.wr_dot, "setBackgroundResource",
                release ? R.drawable.widget_dot_green : R.drawable.widget_dot);
        r.setTextColor(R.id.wr_title, light ? 0xFF17171A : 0xFFF2F2F2);
        r.setTextColor(R.id.wr_sub, light ? 0xFF6B6B70 : 0xFFB3B3B3);
        return r;
    }
}
