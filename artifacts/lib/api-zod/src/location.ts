const googleMapsHosts = new Set([
  "maps.google.com",
  "google.com",
  "www.google.com",
  "maps.app.goo.gl",
  "goo.gl",
]);

export function isGoogleMapsUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  const parsed = value.match(/^https:\/\/([^/?#]+)(\/[^?#]*)?(?:[?#].*)?$/i);
  if (!parsed) return false;
  const host = parsed[1].toLowerCase();
  const path = parsed[2] ?? "/";
  if (!googleMapsHosts.has(host)) return false;
  if (host === "google.com" || host === "www.google.com" || host === "goo.gl") {
    return /^\/maps(?:\/|$)/.test(path);
  }
  return true;
}
