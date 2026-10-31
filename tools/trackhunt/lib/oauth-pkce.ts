function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function randomBase64Url(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function safeRelativeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/connections";
  try {
    const parsed = new URL(value, "https://trackhunt.local");
    if (parsed.origin !== "https://trackhunt.local") return "/connections";
    if (parsed.pathname.startsWith("/api/") || parsed.pathname === "/callback") return "/connections";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/connections";
  }
}

export function spotifyAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  scopes: readonly string[];
}): string {
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", input.challenge);
  return url.toString();
}

