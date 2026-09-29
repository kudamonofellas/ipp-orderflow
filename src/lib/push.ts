/**
 * Native push notifications (Android APK only).
 *
 * Capacitor's WebView does not support Web Push, so this goes through FCM
 * via `@capacitor/push-notifications`. Everything here is a no-op in a
 * browser — `Capacitor.isNativePlatform()` is false there, and the plugin
 * would throw "not implemented on web". The web app simply never registers.
 *
 * Flow: after login `registerPush()` asks for permission, registers with
 * FCM, and stores the returned token in `push_tokens` against the current
 * user. `unregisterPush()` on logout deletes that row so a shared phone
 * stops receiving the previous user's notifications. Sending happens
 * server-side (the `push-notify` Directus extension), never from here.
 */

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { deletePushToken, upsertPushToken } from "./directus";

/** The token this device last registered — kept so logout can delete the
 *  right row without asking FCM again. */
let currentToken: string | null = null;

/** Listener handles, removed on unregister so a re-login doesn't stack
 *  duplicate handlers (each would navigate on the same tap). */
let listenersAttached = false;

export function isPushSupported(): boolean {
  return Capacitor.isNativePlatform();
}

/** Where a tap should navigate. `route` (set by a reminder that summarizes
 *  several orders) takes priority over `orderId` when both are present. */
export interface PushTarget {
  orderId?: string;
  route?: string;
}

export interface PushCallbacks {
  /** Foreground delivery — Android does not draw a tray notification while
   *  the app is open, so the UI shows its own banner. */
  onForeground?: (title: string, body: string, target: PushTarget) => void;
  /** The user tapped a notification (app in background or closed). */
  onOpen?: (target: PushTarget) => void;
}

/**
 * The outcome of a registration attempt.
 *
 * `denied` is the one worth telling the user about: Android only prompts
 * once, so a declined permission is permanent until they change it in system
 * settings — without a hint, notifications just silently never arrive.
 */
export type PushStatus = "registered" | "denied" | "unsupported" | "error";

/** Ask for permission, register with FCM, and persist the token. */
export async function registerPush(
  userId: string,
  callbacks: PushCallbacks = {},
): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported";

  try {
    let status = await PushNotifications.checkPermissions();
    if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
      status = await PushNotifications.requestPermissions();
    }
    if (status.receive !== "granted") return "denied";

    if (!listenersAttached) {
      await PushNotifications.addListener("registration", (token) => {
        currentToken = token.value;
        // Fire-and-forget: a failed write just means no notifications until
        // the next login, which is not worth blocking the UI over.
        void upsertPushToken(userId, token.value);
      });

      await PushNotifications.addListener("registrationError", (err) => {
        console.warn("Push registration failed", err);
      });

      await PushNotifications.addListener(
        "pushNotificationReceived",
        (notification) => {
          const orderId = notification.data?.orderId as string | undefined;
          const route = notification.data?.route as string | undefined;
          callbacks.onForeground?.(
            notification.title ?? "",
            notification.body ?? "",
            { orderId, route },
          );
        },
      );

      await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const orderId = action.notification.data?.orderId as
            | string
            | undefined;
          const route = action.notification.data?.route as
            | string
            | undefined;
          if (orderId || route) callbacks.onOpen?.({ orderId, route });
        },
      );

      listenersAttached = true;
    }

    await PushNotifications.register();
    return "registered";
  } catch (err) {
    console.warn("Push setup failed", err);
    return "error";
  }
}

/**
 * Re-registers with FCM if permission is already granted — a no-op
 * otherwise (never re-prompts). Called on app resume, throttled by the
 * caller, so a token Android rotates while the app is installed is saved
 * before the next send rather than at the next login, and a user who
 * enabled notifications in Android Settings gets registered without
 * needing to log out and back in.
 *
 * Requires listeners to already be attached — i.e. `registerPush` must have
 * run at least once (even if it returned "denied") — since this only calls
 * the native `register()`, not the full setup.
 */
export async function refreshPushRegistration(): Promise<void> {
  if (!isPushSupported() || !listenersAttached) return;
  try {
    const status = await PushNotifications.checkPermissions();
    if (status.receive !== "granted") return;
    await PushNotifications.register();
  } catch (err) {
    console.warn("Push refresh failed", err);
  }
}

/** Delete this device's token row and drop the listeners. Safe to call when
 *  registration never happened. */
export async function unregisterPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    if (currentToken) {
      await deletePushToken(currentToken);
      currentToken = null;
    }
    await PushNotifications.removeAllListeners();
    listenersAttached = false;
  } catch (err) {
    console.warn("Push teardown failed", err);
  }
}
