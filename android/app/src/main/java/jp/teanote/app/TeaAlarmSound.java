package jp.teanote.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

/**
 * タイマーのアラーム音とバイブ。
 * 目覚まし時計と同じ「アラーム」の音として直接鳴らすので、マナーモードやサイレントでも鳴る
 * （通知の音として鳴らすと、機種によってはマナーモード・サイレントで止められてしまうため）。
 * 音量は「アラームの音量」に従う。止めるまで繰り返し、最長 1 分で止まる。
 */
final class TeaAlarmSound {
    static final long RING_MS = 60 * 1000;
    private static final long[] VIBRATION = { 0, 500, 300, 500, 300, 500, 1200 };

    private static MediaPlayer player;
    private static Vibrator vibrator;
    private static PowerManager.WakeLock wakeLock;
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static final Runnable autoStop = TeaAlarmSound::stopInternal;

    private TeaAlarmSound() {}

    static synchronized void start(Context context) {
        stopInternal();
        Context app = context.getApplicationContext();
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        // 鳴っている間は端末が眠らないようにする
        PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "teanote:alarm");
        wakeLock.acquire(RING_MS + 5000);

        // アプリを開いているときのチャイム（js/timer.js の Chime）と同じ音。scripts/make-chime.mjs で作る
        Uri sound = Uri.parse("android.resource://" + app.getPackageName() + "/" + R.raw.tea_chime);
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(attrs);
            player.setDataSource(app, sound);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) {
            if (player != null) player.release();
            player = null;
        }

        vibrator = (Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(VIBRATION, 0), attrs);
            } else {
                vibrator.vibrate(VIBRATION, 0, attrs);
            }
        }
        handler.postDelayed(autoStop, RING_MS);
    }

    static synchronized void stop() {
        stopInternal();
    }

    private static synchronized void stopInternal() {
        handler.removeCallbacks(autoStop);
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) { }
            player.release();
            player = null;
        }
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }
}
