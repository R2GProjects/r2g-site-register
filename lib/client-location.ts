/** Current position, or a message the sign-in screen can show as-is. */
export function readDevicePosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(
        new Error(
          "Location is not available on this device. Scan the site QR at the gate instead."
        )
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () =>
        reject(
          new Error(
            "Allow location, or scan the site QR at the gate to sign in."
          )
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    );
  });
}
