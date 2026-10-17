package jp.teanote.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * 予約した時刻に「お茶が入りました」の通知を出し、アラーム音（TeaAlarmSound）を鳴らす。
 * 通知そのものは音を出さない（音は TeaAlarmSound が鳴らす）。
 * 通知を消したときは ACTION_STOP で呼ばれ、アラーム音を止める。
 */
public class TeaAlarmReceiver extends BroadcastReceiver {

    static final String ACTION_STOP = "jp.teanote.app.ALARM_STOP";
    static final String CHANNEL_ID = "tea_timer_done";
    static final int NOTIFICATION_ID = 7001;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_STOP.equals(intent.getAction())) {
            TeaAlarmSound.stop();
            return;
        }
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // 以前の版で作った、音つきの通知チャンネルは使わないので消しておく
            nm.deleteNotificationChannel("tea_alarm");
            nm.deleteNotificationChannel("timer");
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "タイマー", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("蒸らし時間の終わりのお知らせ（音はアラームとして鳴ります）");
                ch.setSound(null, null);
                ch.enableVibration(false);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
        }

        // 通知をタップしたらアプリを開く（アプリ側でアラーム音を止める）
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(context, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // 通知を横にスワイプして消したら、アラーム音を止める
        Intent stop = new Intent(context, TeaAlarmReceiver.class).setAction(ACTION_STOP);
        PendingIntent delete = PendingIntent.getBroadcast(context, 1, stop,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_tea)
            .setColor(0xFF9A3F1C)
            .setContentTitle(intent.getStringExtra("title"))
            .setContentText(intent.getStringExtra("body"))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(content)
            .setDeleteIntent(delete)
            .setAutoCancel(true)
            .setSilent(true)
            .setTimeoutAfter(TeaAlarmSound.RING_MS)
            .build();
        nm.notify(NOTIFICATION_ID, n);

        TeaAlarmSound.start(context);
    }
}
