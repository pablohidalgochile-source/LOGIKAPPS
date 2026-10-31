const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.trim().toLowerCase().replace(/^\[|\]$/g, ""));
}

export function isLoopbackUrl(rawUrl: string): boolean {
  try {
    return isLoopbackHostname(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

export function isLoopbackHostHeader(value: string | null): boolean {
  if (!value) return false;
  try {
    return isLoopbackHostname(new URL(`http://${value}`).hostname);
  } catch {
    return false;
  }
}
