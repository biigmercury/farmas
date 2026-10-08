// Ask the phone where it is. The browser shows its own "Allow location?" question; we only get a position if the
// farmer says yes. Nothing is stored: the position is sent with that one question and then forgotten.

export type Position = { lat: number; lng: number };

export type GeoFailure = "denied" | "unavailable" | "timeout";

export class GeoError extends Error {
  reason: GeoFailure;
  constructor(reason: GeoFailure) {
    super(
      reason === "denied"
        ? "Location is turned off for FarmAs. You can allow it in your browser settings."
        : reason === "timeout"
          ? "Your phone took too long to find your location."
          : "Your phone could not find your location.",
    );
    this.name = "GeoError";
    this.reason = reason;
  }
}

/** How long we wait in total, including while the browser's "Allow location?" question is still unanswered. */
const GIVE_UP_MS = 20_000;

export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new GeoError("unavailable"));
      return;
    }
    // The browser's own timeout only starts after the farmer answers the question. If they ignore it, give up here.
    const giveUp = setTimeout(() => reject(new GeoError("timeout")), GIVE_UP_MS);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(giveUp);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      (e) => {
        clearTimeout(giveUp);
        reject(new GeoError(e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "timeout" : "unavailable"));
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  });
}
