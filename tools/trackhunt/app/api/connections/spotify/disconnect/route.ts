import { disconnectSpotify, spotifyConnectionStatus } from "../../../../../lib/spotify-server";
import { mutationSecurityError, noStoreJson, requireRequestUser } from "../../../../../lib/request-security";

export async function POST(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  const status = await spotifyConnectionStatus(user.userId);
  if (!status.connected) return noStoreJson({ disconnected: true });
  const securityError = mutationSecurityError(request, status.csrfToken);
  if (securityError) return securityError;
  await disconnectSpotify(user.userId);
  return noStoreJson({ disconnected: true });
}

