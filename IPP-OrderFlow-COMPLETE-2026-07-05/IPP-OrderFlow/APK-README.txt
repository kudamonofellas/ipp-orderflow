IPP OrderFlow — Android APK
===========================

INSTALL (on each phone)
1. Copy IPP-OrderFlow.apk to the phone (WhatsApp yourself / USB / Google Drive).
2. Tap the file on the phone. Android will warn about unknown apps —
   allow "Install from this source" for the app you opened it with.
3. Open IPP OrderFlow from the home screen. Allow Location when asked
   (needed for the GPS stamps on pickups/deliveries) and Camera when taking
   proof photos.

IMPORTANT — HOW THE DATA WORKS TODAY
The app is offline-first. The APK carries the whole app INSIDE it — it does
not need the PC, WiFi, or any server to run. That also means:

  * Each phone has ITS OWN copy of the data (orders, photos, learning).
  * The phone and the PC are NOT automatically in sync.
  * To move data between devices: Settings -> Backup on one device,
    send the file, Settings -> Restore on the other. That is the manual
    bridge until the app goes online.

Real automatic sync (everyone sees the same orders live, office sees the
courier moving on the map, real logins) comes with the Firebase backend on
the go-online checklist. When that is connected, this same APK setup gets
pointed at it and every device shares one database.

UPDATING THE APP
When the app changes on the PC, a new APK must be built and re-installed on
the phones (it installs over the old one; the phone's data is kept).

This is a debug-signed APK for internal team use — fine for IPP's own
phones, not for the Play Store (that needs a release signing key, which we
can set up when needed).
