package jp.teanote.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TeaAlarmPlugin.class); // タイマーのアラーム（このアプリ専用の部品）
        super.onCreate(savedInstanceState);
    }
}
