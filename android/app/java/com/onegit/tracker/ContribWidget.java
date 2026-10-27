package com.onegit.tracker;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Home screen widget: contribution heatmap + streak for the personal account. */
public class ContribWidget extends AppWidgetProvider {

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    @Override public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (i != null && UpdatesWidget.ACTION_REFRESH.equals(i.getAction())) WidgetData.refreshAll(c);
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, ContribWidget.class));
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static RemoteViews build(Context c) {
        boolean light = WidgetData.isLight(c);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_contrib);
        rv.setInt(R.id.w_root, "setBackgroundResource", WidgetData.bgFor(c));

        JSONObject contrib = null;
        try { contrib = new JSONObject(WidgetData.snapshot(c)).optJSONObject("contrib"); } catch (Throwable ignored) { }

        if (contrib == null) {
            rv.setTextViewText(R.id.w_title, "Contributions");
            rv.setTextViewText(R.id.w_sub, "Set your account in the app");
        } else {
            String login = contrib.optString("login", "");
            rv.setTextViewText(R.id.w_title, login.isEmpty() ? "Contributions" : "@" + login);
            rv.setTextViewText(R.id.w_sub, contrib.optInt("total", 0) + " this year · "
                    + contrib.optInt("streak", 0) + "d streak");
            Bitmap bmp = heat(contrib.optJSONArray("days"), WidgetData.accent(c), 420, 132, light);
            if (bmp != null) rv.setImageViewBitmap(R.id.w_heat, bmp);
        }
        rv.setOnClickPendingIntent(R.id.w_refresh, WidgetData.refreshIntent(c, 31));
        rv.setOnClickPendingIntent(R.id.w_root, WidgetData.openApp(c, 32));
        return rv;
    }

    /** days is [[date, count, level], ...] oldest first */
    static Bitmap heat(JSONArray days, int accent, int maxW, int maxH, boolean light) {
        if (days == null || days.length() == 0) return null;
        int n = days.length();
        int cols = (int) Math.ceil(n / 7.0);
        int gap = 3;
        int cellW = Math.max(3, (maxW - gap * (cols - 1)) / Math.max(cols, 1));
        int cellH = Math.max(3, (maxH - gap * 6) / 7);
        int cell = Math.min(cellW, cellH);
        int totalW = Math.max(1, cols * cell + (cols - 1) * gap);
        int totalH = Math.max(1, 7 * cell + 6 * gap);

        Bitmap bmp = Bitmap.createBitmap(totalW, totalH, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        int base = light ? 0x14000000 : 0x22FFFFFF;
        int r = (accent >> 16) & 255, g = (accent >> 8) & 255, b = accent & 255;

        for (int i = 0; i < n; i++) {
            JSONArray d = days.optJSONArray(i);
            if (d == null) continue;
            int lvl = Math.min(4, Math.max(0, d.optInt(2, 0)));
            int col = i / 7, row = i % 7;
            int x = col * (cell + gap), y = row * (cell + gap);
            if (lvl <= 0) {
                p.setColor(base);
            } else {
                float a = 0.24f + 0.19f * lvl;
                p.setColor(Color.argb((int) (255 * Math.min(a, 1f)), r, g, b));
            }
            cv.drawRoundRect(x, y, x + cell, y + cell, cell * 0.3f, cell * 0.3f, p);
        }
        return bmp;
    }
}
