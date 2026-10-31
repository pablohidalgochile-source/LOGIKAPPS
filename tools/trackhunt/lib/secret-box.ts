const VERSION = "v1";

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function getKey(): Promise<CryptoKey> {
  const value = process.env.CONNECTIONS_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error("CONNECTIONS_ENCRYPTION_KEY is not configured.");
  const raw = fromBase64Url(value);
  if (raw.byteLength !== 32) throw new Error("CONNECTIONS_ENCRYPTION_KEY must contain 32 random bytes.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    await getKey(),
    new TextEncoder().encode(plaintext),
  );
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(box: string, aad: string): Promise<string> {
  const [version, encodedIv, encodedCiphertext] = box.split(".");
  if (version !== VERSION || !encodedIv || !encodedCiphertext) throw new Error("Encrypted value is invalid.");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(encodedIv), additionalData: new TextEncoder().encode(aad) },
    await getKey(),
    fromBase64Url(encodedCiphertext),
  );
  return new TextDecoder().decode(plaintext);
}

