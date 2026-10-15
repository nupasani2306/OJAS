// Bundled by scripts/build-www.mjs into www/vendor/capacitor-ble.js (Android app build only).
// Exposes the Capacitor Bluetooth LE client to the plain <script> files (ble-adapter.js).
import { BleClient } from '@capacitor-community/bluetooth-le';

window.OjasNativeBle = { BleClient };
