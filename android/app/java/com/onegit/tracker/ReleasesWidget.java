package com.onegit.tracker;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Home screen widget: the latest releases with their files. */
public class ReleasesWidget extends AppWidgetProvider {

    private static final int MAX_ROWS = 3;

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    @Override public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (i != null && UpdatesWidget.ACTION_REFRESH.equals(i.getAction())) WidgetData.refreshAll(c);
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, ReleasesWidget.class));
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static RemoteViews build(Context c) {
        boolean light = WidgetData.isLight(c);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_releases);
        rv.setInt(R.id.w_root, "setBackgroundResource", WidgetData.bgFor(c));
        rv.removeAllViews(R.id.w_rows);

        JSONArray rows = new JSONArray();
        try { rows = new JSONObject(WidgetData.snapshot(c)).optJSONArray("releases"); } catch (Throwable ignored) { }
        if (rows == null) rows = new JSONArray();

        if (rows.length() == 0) {
            rv.addView(R.id.w_rows, UpdatesWidget.rowViews(c, "No releases yet", "Nothing published", true, light));
            rv.setTextViewText(R.id.w_sub, "nothing published yet");
        } else {
            for (int i = 0; i < Math.min(MAX_ROWS, rows.length()); i++) {
                JSONObject o = rows.optJSONObject(i);
                if (o == null) continue;
                rv.addView(R.id.w_rows, UpdatesWidget.rowViews(c, o.optString("t"), o.optString("s"), true, light));
            }
            rv.setTextViewText(R.id.w_sub, "latest " + Math.min(MAX_ROWS, rows.length()) + " with files");
        }
        rv.setOnClickPendingIntent(R.id.w_refresh, WidgetData.refreshIntent(c, 21));
        rv.setOnClickPendingIntent(R.id.w_root, WidgetData.openApp(c, 22));
        return rv;
    }
}
