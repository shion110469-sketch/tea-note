package jp.teanote.app;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * タイマーの終わりを「アラーム」として知らせる（js/timer.js の NativeAlarm から使う）。
 * 通知の音はマナーモード・サイレントで止められるため、終わる時刻に通知を出し、
 * 音は目覚まし時計と同じアラームの音として鳴らす（TeaAlarmReceiver・TeaAlarmSound）。
 */
@CapacitorPlugin(name = "TeaAlarm")
public class TeaAlarmPlugin extends Plugin {

    static final int REQUEST_CODE = 7001;

    /** 終わる時刻（at：ミリ秒）に知らせを予約する */
    @PluginMethod
    public void schedule(PluginCall call) {
        Long at = call.getLong("at");
        if (at == null) {
            call.reject("at が必要です");
            return;
        }
        Context ctx = getContext();
        Intent intent = new Intent(ctx, TeaAlarmReceiver.class);
        intent.putExtra("title", call.getString("title", "お茶が入りました"));
        intent.putExtra("body", call.getString("body", ""));
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = pending(ctx, intent);
        // 正確な時刻に鳴らせる場合はそうする（Android 12 以降は許可がないと数分ずれることがある）
        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        call.resolve();
    }

    /** アプリを開いているときに時間になった：予約を取り消して、同じアラーム音をすぐ鳴らす（通知は出さない） */
    @PluginMethod
    public void ring(PluginCall call) {
        Context ctx = getContext();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        am.cancel(pending(ctx, new Intent(ctx, TeaAlarmReceiver.class)));
        TeaAlarmSound.start(ctx);
        call.resolve();
    }

    /** 予約を取り消し、表示中・鳴っている知らせも止める */
    @PluginMethod
    public void cancel(PluginCall call) {
        Context ctx = getContext();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        // 予約と同じ内容の PendingIntent を作って取り消す
        am.cancel(pending(ctx, new Intent(ctx, TeaAlarmReceiver.class)));
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(TeaAlarmReceiver.NOTIFICATION_ID);
        TeaAlarmSound.stop();
        call.resolve();
    }

    private static PendingIntent pending(Context ctx, Intent intent) {
        return PendingIntent.getBroadcast(ctx, REQUEST_CODE, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
