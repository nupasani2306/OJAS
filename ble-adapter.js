// Bluetooth transport used by band.js. Load before band.js on every app page.
//
// The same small interface on two platforms; band.js keeps all OJAS logic (device name, UUIDs,
// JSON parsing, validity checks, alerts, ACK/CANCEL, reconnects). This file only moves bytes.
//
//   Android app (Capacitor): @capacitor-community/bluetooth-le, bundled by scripts/build-www.mjs into
//                            vendor/capacitor-ble.js (exists only in the app build, not in the browser)
//   Browser:                 Web Bluetooth (Chrome / Edge), exactly as before
//
// Interface (a "device" is an opaque handle returned by requestDevice / knownDevice):
//   supported, unsupportedReason, platform ('android' | 'web')
//   requestDevice()                    → device   (shows the picker; call from a tap)
//   knownDevice()                      → device | null (reconnect without the picker)
//   name(device)
//   connect(device, onDisconnect)      → resolves when connected
//   characteristics(device, service, uuids) → { uuid: { read, write, writeWithoutResponse, notify, indicate } }
//                                       (only the uuids that exist on the device)
//   subscribe(device, service, uuid, onValue(DataView))
//   read(device, service, uuid)        → DataView
//   write(device, service, uuid, Uint8Array)
//   cleanup(device)                    → stop notifications / listeners (best effort)
//   disconnect(device)
const ojasBleAdapter = (() => {
  const NAME = 'OJAS-Band';
  const NAME_PREFIX = 'OJAS';
  const lower = (u) => String(u).toLowerCase();
  const isNative = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform());

  // A device without the OJAS service: band.js does not retry it.
  function wrongDevice(cause) {
    const e = new Error('This device does not have the OJAS Band service. Choose "OJAS-Band".');
    e.code = 'WRONG_DEVICE';
    if (cause) e.cause = cause;
    return e;
  }

  return isNative ? nativeTransport() : webTransport();

  /* ---------------------------------------------------------------- Web Bluetooth (browser) */
  function webTransport() {
    const supported = !!(navigator.bluetooth && window.isSecureContext);
    const chars = new WeakMap();    // device → { uuid: BluetoothRemoteGATTCharacteristic }

    return {
      platform: 'web',
      supported,
      unsupportedReason: navigator.bluetooth
        ? 'Bluetooth needs a secure page: open OJAS at http://localhost or over https.'
        : 'This browser cannot use Bluetooth. Use Chrome (Android, Windows, Mac or ChromeOS).',

      async requestDevice(service) {
        return navigator.bluetooth.requestDevice({
          filters: [{ name: NAME }, { namePrefix: NAME_PREFIX }],
          optionalServices: [service],
        });
      },

      // Works where Chrome supports navigator.bluetooth.getDevices().
      async knownDevice() {
        if (!supported || !navigator.bluetooth.getDevices) return null;
        const known = await navigator.bluetooth.getDevices();
        return known.find((d) => d.name === NAME) || known.find((d) => (d.name || '').startsWith(NAME_PREFIX)) || null;
      },

      name: (device) => (device ? device.name : null),

      async connect(device, onDisconnect) {
        if (device._ojasOnDisconnect) device.removeEventListener('gattserverdisconnected', device._ojasOnDisconnect);
        device._ojasOnDisconnect = () => onDisconnect();
        device.addEventListener('gattserverdisconnected', device._ojasOnDisconnect);
        await device.gatt.connect();
      },

      // One getCharacteristic() per wanted uuid, as the browser version always did.
      async characteristics(device, service, uuids) {
        let s;
        try {
          s = await device.gatt.getPrimaryService(service);
        } catch (err) {
          throw wrongDevice(err);
        }
        const list = [];
        for (const uuid of uuids) {
          try { list.push(await s.getCharacteristic(uuid)); } catch { /* not on this device */ }
        }
        const map = {};
        const out = {};
        for (const ch of list) {
          map[lower(ch.uuid)] = ch;
          const p = ch.properties || {};
          out[lower(ch.uuid)] = { read: !!p.read, write: !!p.write, writeWithoutResponse: !!p.writeWithoutResponse, notify: !!p.notify, indicate: !!p.indicate };
        }
        chars.set(device, map);
        return out;
      },

      async subscribe(device, service, uuid, onValue) {
        const ch = (chars.get(device) || {})[lower(uuid)];
        if (!ch) throw new Error(`Characteristic ${uuid} not found`);
        if (ch._ojasHandler) ch.removeEventListener('characteristicvaluechanged', ch._ojasHandler);
        ch._ojasHandler = (e) => onValue(e.target.value);
        ch.addEventListener('characteristicvaluechanged', ch._ojasHandler);
        await ch.startNotifications();
      },

      // Note: Chrome also reports a read's result through 'characteristicvaluechanged' (band.js handles that).
      async read(device, service, uuid) {
        const ch = (chars.get(device) || {})[lower(uuid)];
        if (!ch) throw new Error(`Characteristic ${uuid} not found`);
        return ch.readValue();
      },

      async write(device, service, uuid, bytes) {
        const ch = (chars.get(device) || {})[lower(uuid)];
        if (!ch) throw new Error(`Characteristic ${uuid} not found`);
        if (ch.writeValueWithoutResponse && ch.properties && ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(bytes);
        else if (ch.writeValueWithResponse) await ch.writeValueWithResponse(bytes);
        else await ch.writeValue(bytes);
      },

      async cleanup(device) {
        for (const ch of Object.values(chars.get(device) || {})) {
          if (ch._ojasHandler) { ch.removeEventListener('characteristicvaluechanged', ch._ojasHandler); ch._ojasHandler = null; }
        }
      },

      async disconnect(device) {
        if (device && device.gatt.connected) device.gatt.disconnect();
      },
    };
  }

  /* ---------------------------------------------------------------- Native (Android app) */
  function nativeTransport() {
    const lib = window.OjasNativeBle;               // set by vendor/capacitor-ble.js
    const ble = lib && lib.BleClient;
    const STORE_KEY = 'ojas.bleDevice';             // the confirmed band; removed on sign-out with the other ojas.* keys
    let initialized = null;
    const props = new Map();                        // deviceId → { uuid: properties }
    const subs = new Map();                         // deviceId → Set of "service|uuid"

    const save = (d) => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ deviceId: d.deviceId, name: d.name || NAME })); } catch { /* storage blocked */ } };
    const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; } };

    // Asks for the Bluetooth permissions the first time (Android 12+: "Nearby devices";
    // Android 11 and older: location). prompt = also ask to switch Bluetooth on.
    async function ready(prompt) {
      if (!ble) throw new Error('Bluetooth support is missing from this app build. Rebuild with: npm run android:sync');
      if (!initialized) {
        initialized = ble.initialize({ androidNeverForLocation: true }).catch((err) => {
          initialized = null;
          const e = new Error('OJAS needs the Bluetooth ("Nearby devices") permission to connect to your band. Allow it in Android Settings → Apps → OJAS → Permissions.');
          e.cause = err;
          throw e;
        });
      }
      await initialized;
      if (await ble.isEnabled()) return;
      if (prompt) {
        try { await ble.requestEnable(); } catch { /* declined */ }
        if (await ble.isEnabled()) return;
      }
      throw new Error('Bluetooth is off. Turn on Bluetooth to connect your OJAS Band.');
    }

    function key(device) { return device.deviceId; }

    return {
      platform: 'android',
      supported: !!ble,
      unsupportedReason: 'Bluetooth support is missing from this app build. Rebuild with: npm run android:sync',

      async requestDevice(service) {
        await ready(true);
        let device;
        try {
          device = await ble.requestDevice({ namePrefix: NAME_PREFIX, optionalServices: [service] });
        } catch (err) {
          if (/cancel/i.test(err && err.message)) {                     // picker closed: same as in Chrome
            const e = new Error('No band selected');
            e.name = 'NotFoundError';
            throw e;
          }
          throw err;
        }
        return device;
      },

      // The band chosen earlier on this phone (saved by requestDevice). Connecting by its ID needs no scan.
      async knownDevice() {
        const saved = load();
        if (!saved || !saved.deviceId) return null;
        try { await ready(false); } catch { return null; }                // no permission prompts without a tap
        return saved;
      },

      name: (device) => (device ? device.name : null),

      // If the band is still connected (e.g. after moving to another page), the plugin resolves at once.
      async connect(device, onDisconnect) {
        await ready(false);
        await ble.connect(key(device), () => { subs.delete(key(device)); onDisconnect(); }, { timeout: 10000 });
      },

      async characteristics(device, service, uuids) {
        const services = await ble.getServices(key(device));
        const s = services.find((x) => lower(x.uuid) === lower(service));
        if (!s) throw wrongDevice();
        save(device);                               // remember it only once it is a confirmed OJAS Band
        const out = {};
        const wanted = new Set(uuids.map(lower));
        for (const c of s.characteristics || []) {
          if (!wanted.has(lower(c.uuid))) continue;
          const p = c.properties || {};
          out[lower(c.uuid)] = { read: !!p.read, write: !!p.write, writeWithoutResponse: !!p.writeWithoutResponse, notify: !!p.notify, indicate: !!p.indicate };
        }
        props.set(key(device), out);
        return out;
      },

      async subscribe(device, service, uuid, onValue) {
        const id = key(device);
        const tag = `${lower(service)}|${lower(uuid)}`;
        const set = subs.get(id) || new Set();
        if (set.has(tag)) { try { await ble.stopNotifications(id, service, uuid); } catch { /* not active */ } }
        await ble.startNotifications(id, service, uuid, (value) => onValue(value));
        set.add(tag);
        subs.set(id, set);
      },

      async read(device, service, uuid) {
        return ble.read(key(device), service, uuid);
      },

      async write(device, service, uuid, bytes) {
        const id = key(device);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const p = (props.get(id) || {})[lower(uuid)] || {};
        if (p.writeWithoutResponse) await ble.writeWithoutResponse(id, service, uuid, view);
        else await ble.write(id, service, uuid, view);
      },

      async cleanup(device) {
        if (!device) return;
        const id = key(device);
        const set = subs.get(id);
        subs.delete(id);
        for (const tag of set || []) {
          const [service, uuid] = tag.split('|');
          try { await ble.stopNotifications(id, service, uuid); } catch { /* already gone */ }
        }
      },

      async disconnect(device) {
        if (!device) return;
        await this.cleanup(device);
        try { await ble.disconnect(key(device)); } catch { /* already disconnected */ }
      },
    };
  }
})();
