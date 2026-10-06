package de.charavision.sonntagsfragen;

import android.app.NotificationChannel;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

public class NotificationJobService extends JobService {
    public static final String PREFERENCES = "sonntagsfragen_notifications";
    private static final int PERIODIC_JOB_ID = 42010;
    private static final int INITIAL_JOB_ID = 42011;
    private static final long DEFAULT_REFRESH_INTERVAL_MS = 30L * 60L * 1000L;
    private static final String CHANNEL_POLLS = "new_polls";
    private static final String CHANNEL_SYSTEM = "system_messages";
    private static final String POLLS_URL = "https://charavision.github.io/SonntagsfrageView/data/polls.json";
    private static final String SYSTEM_URL = "https://sonntagsfragen-report.charavisionj5.workers.dev/notifications/system";

    public static void schedule(Context context, boolean enabled) {
        try {
            JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler == null) return;
            scheduler.cancel(PERIODIC_JOB_ID);
            scheduler.cancel(INITIAL_JOB_ID);
            if (!enabled) return;
            ComponentName service = new ComponentName(context, NotificationJobService.class);
            JobInfo initial = new JobInfo.Builder(INITIAL_JOB_ID, service)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setMinimumLatency(1000L)
                .setOverrideDeadline(5000L)
                .build();
            scheduler.schedule(initial);
        } catch (RuntimeException ignored) { }
    }

    private static void scheduleNextCheck(Context context, long refreshIntervalMs) {
        try {
            SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, MODE_PRIVATE);
            if (!preferences.getBoolean("enabled", false)) return;
            JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler == null) return;
            ComponentName service = new ComponentName(context, NotificationJobService.class);
            JobInfo next = new JobInfo.Builder(PERIODIC_JOB_ID, service)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setMinimumLatency(refreshIntervalMs)
                .setOverrideDeadline(refreshIntervalMs * 2L)
                .setPersisted(true)
                .build();
            scheduler.schedule(next);
        } catch (RuntimeException ignored) { }
    }

    @Override
    public boolean onStartJob(JobParameters parameters) {
        new Thread(() -> {
            long refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS;
            try {
                checkForUpdates();
                refreshIntervalMs = fetchRefreshInterval();
            }
            finally {
                scheduleNextCheck(NotificationJobService.this, refreshIntervalMs);
                jobFinished(parameters, false);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters parameters) { return true; }

    private void checkForUpdates() {
        SharedPreferences preferences = getSharedPreferences(PREFERENCES, MODE_PRIVATE);
        if (!preferences.getBoolean("enabled", false)) return;
        createChannels();
        if (preferences.getBoolean("polls", true)) checkPolls(preferences);
        if (preferences.getBoolean("system", true)) checkSystemMessages(preferences);
    }

    private void checkPolls(SharedPreferences preferences) {
        try {
            JSONObject polls = new JSONObject(fetch(POLLS_URL)).getJSONObject("polls");
            Set<String> selected = preferences.getStringSet("regions", Collections.emptySet());
            SharedPreferences.Editor editor = preferences.edit();
            for (String region : selected) {
                JSONArray regionPolls = polls.optJSONArray(region);
                if (regionPolls == null || regionPolls.length() == 0) continue;
                JSONArray latest = regionPolls.optJSONArray(0);
                if (latest == null) continue;
                String date = latest.optString(0, "");
                String institute = latest.optString(1, "");
                String key = date + "|" + institute;
                String preferenceKey = "latest_poll_" + region;
                String previous = preferences.getString(preferenceKey, "");
                editor.putString(preferenceKey, key);
                if (!previous.isEmpty() && !previous.equals(key)) {
                    notify(CHANNEL_POLLS, "Neue Umfrage – " + region, institute + " · " + germanDate(date), (region + key).hashCode());
                }
            }
            editor.apply();
        } catch (Exception ignored) { }
    }

    private void checkSystemMessages(SharedPreferences preferences) {
        try {
            JSONArray messages = new JSONObject(fetch(SYSTEM_URL)).optJSONArray("messages");
            if (messages == null || messages.length() == 0) return;
            String last = preferences.getString("latest_system_message", "");
            List<JSONObject> unseen = new ArrayList<>();
            for (int index = 0; index < messages.length(); index += 1) {
                JSONObject message = messages.optJSONObject(index);
                if (message == null) continue;
                if (message.optString("id").equals(last)) break;
                unseen.add(message);
            }
            preferences.edit().putString("latest_system_message", messages.getJSONObject(0).optString("id")).apply();
            if (last.isEmpty() && unseen.size() > 1) unseen = new ArrayList<>(unseen.subList(0, 1));
            Collections.reverse(unseen);
            for (JSONObject message : unseen) notify(CHANNEL_SYSTEM, message.optString("title", "Sonntagsfragen"), message.optString("body"), message.optString("id").hashCode());
        } catch (Exception ignored) { }
    }

    private long fetchRefreshInterval() {
        try {
            JSONObject setting = new JSONObject(fetch("https://sonntagsfragen-report.charavisionj5.workers.dev/settings/notification-interval"));
            return setting.optInt("intervalMinutes", 30) == 1 ? 60L * 1000L : DEFAULT_REFRESH_INTERVAL_MS;
        } catch (Exception ignored) { return DEFAULT_REFRESH_INTERVAL_MS; }
    }

    private String fetch(String address) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address + (address.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis()).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(15000);
        connection.setRequestProperty("User-Agent", "Sonntagsfragen-Android/1.0.25");
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder result = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
            return result.toString();
        } finally { connection.disconnect(); }
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL_POLLS, "Neue Umfragen", NotificationManager.IMPORTANCE_DEFAULT));
        manager.createNotificationChannel(new NotificationChannel(CHANNEL_SYSTEM, "Systemnachrichten", NotificationManager.IMPORTANCE_DEFAULT));
    }

    private void notify(String channel, String title, String body, int id) {
        try {
            Intent openApp = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent contentIntent = PendingIntent.getActivity(this, id, openApp, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder notification = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, channel)
                : new Notification.Builder(this);
            notification
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_DEFAULT);
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(id, notification.build());
        } catch (SecurityException ignored) { }
    }

    private String germanDate(String iso) {
        if (iso != null && iso.matches("\\d{4}-\\d{2}-\\d{2}")) return iso.substring(8, 10) + "." + iso.substring(5, 7) + "." + iso.substring(0, 4);
        return iso == null ? "" : iso;
    }
}
