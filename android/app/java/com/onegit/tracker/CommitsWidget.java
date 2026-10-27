package com.onegit.tracker;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Home screen widget: commits only. */
public class CommitsWidget extends AppWidgetProvider {

    private static final int MAX_ROWS = 4;

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    @Override public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (i != null && UpdatesWidget.ACTION_REFRESH.equals(i.getAction())) WidgetData.refreshAll(c);
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, CommitsWidget.class));
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static RemoteViews build(Context c) {
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_commits);
        try {
            boolean light = WidgetData.isLight(c);
            rv.setInt(R.id.w_root, "setBackgroundResource", WidgetData.bgFor(c));
            rv.removeAllViews(R.id.w_rows);

            JSONArray rows = new JSONArray();
            try { rows = new JSONObject(WidgetData.snapshot(c)).optJSONArray("commits"); } catch (Throwable ignored) { }
            if (rows == null) rows = new JSONArray();

            if (rows.length() == 0) {
                rv.addView(R.id.w_rows, UpdatesWidget.rowViews(c, "No commits yet", "Open the app to sync", false, light));
                rv.setTextViewText(R.id.w_sub, "not synced yet");
            } else {
                for (int i = 0; i < Math.min(MAX_ROWS, rows.length()); i++) {
                    JSONObject o = rows.optJSONObject(i);
                    if (o == null) continue;
                    rv.addView(R.id.w_rows, UpdatesWidget.rowViews(c, o.optString("t"), o.optString("s"), false, light));
                }
                rv.setTextViewText(R.id.w_sub, rows.length() + " commits · live");
            }
            rv.setOnClickPendingIntent(R.id.w_refresh, WidgetData.refreshIntent(c, 41));
            rv.setOnClickPendingIntent(R.id.w_root, WidgetData.openApp(c, 42));
        } catch (Throwable t) {
            /* never let a bad paint make the launcher show "Couldn't add widget" */
            try { rv.setTextViewText(R.id.w_title, "Commits"); rv.setTextViewText(R.id.w_sub, "open the app"); } catch (Throwable ignored) { }
        }
        return rv;
    }
}
