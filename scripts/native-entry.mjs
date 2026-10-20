// Bundled by scripts/build-www.mjs into www/vendor/capacitor-native.js (Android app build only).
// Exposes the native plugins to the plain <script> files:
//   window.OjasNativeBle  Capacitor Bluetooth LE client (ble-adapter.js)
//   window.OjasNativeApp  Capacitor App plugin – the phone's back button (back-button.js)
import { BleClient } from '@capacitor-community/bluetooth-le';
import { App } from '@capacitor/app';

window.OjasNativeBle = { BleClient };
window.OjasNativeApp = { App };
