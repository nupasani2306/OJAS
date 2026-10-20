// The phone's back button in the Android app. In a browser this file does nothing: the browser
// handles its own back button, and vendor/capacitor-native.js (window.OjasNativeApp) is only in the app build.
//
// Back:  1. closes the open popup (Medical ID QR, documents, new workout),
//        2. on Home or the sign-in page closes the app (like other Android apps),
//        3. on any other screen goes to the previous screen (Home if there is none).
// While the fall / SOS alert or the band-pairing screen is showing, back is ignored, so an
// emergency cannot be dismissed by accident – use the buttons on it.
(() => {
  const native = window.OjasNativeApp;
  if (!native || !(window.Capacitor && window.Capacitor.isNativePlatform())) return;

  const FIRST_SCREENS = ['home.html', 'index.html'];
  const page = location.pathname.split('/').pop() || 'index.html';
  const shown = (el) => !!el && el.getClientRects().length > 0;   // on screen (not hidden, nor inside something hidden)

  native.App.addListener('backButton', ({ canGoBack }) => {
    if (shown(document.getElementById('fall-alert')) || shown(document.querySelector('.auth-pairing'))) return;

    const close = [...document.querySelectorAll('.modal-close')].find(shown);
    if (close) { close.click(); return; }

    if (FIRST_SCREENS.includes(page)) native.App.exitApp();
    else if (canGoBack) history.back();
    else location.replace('home.html');
  });
})();
