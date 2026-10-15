// Android アプリ版だけで読み込むプラグイン（build-www.mjs が www/js/native.js にまとめる）
// js/platform.js の Platform.plugin(name) から使う
import { SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Haptics } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Purchases } from '@revenuecat/purchases-capacitor';

window.NativePlugins = { Browser, Haptics, LocalNotifications, Purchases };

// 画面上部のヘッダーはいつも暗い色なので、ステータスバー（時計・電池）の文字を白にする
SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.StatusBar }).catch(() => {});
