// Android アプリ版だけで読み込むプラグイン（build-www.mjs が www/js/native.js にまとめる）
// js/platform.js の Platform.plugin(name) から使う
import { Browser } from '@capacitor/browser';
import { Haptics } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Purchases } from '@revenuecat/purchases-capacitor';

window.NativePlugins = { Browser, Haptics, LocalNotifications, Purchases };
