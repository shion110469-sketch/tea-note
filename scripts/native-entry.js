// Android アプリ版だけで読み込むプラグイン（build-www.mjs が www/js/native.js にまとめる）
// js/platform.js の Platform.plugin(name) から使う
import { SystemBars, SystemBarsStyle, SystemBarType, registerPlugin } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Haptics } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Purchases } from '@revenuecat/purchases-capacitor';

// このアプリ専用の部品：タイマーの終わりをアラーム音で知らせる（android/app/.../TeaAlarmPlugin.java）
const TeaAlarm = registerPlugin('TeaAlarm');

window.NativePlugins = { Browser, Haptics, LocalNotifications, Purchases, TeaAlarm };

// 画面上部のヘッダーはいつも暗い色なので、ステータスバー（時計・電池）の文字を白にする
SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.StatusBar }).catch(() => {});
