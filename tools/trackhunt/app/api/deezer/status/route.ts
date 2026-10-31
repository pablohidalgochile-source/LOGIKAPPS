import { deezerConnectionStatus, deezerIsConfigured } from "../../../../lib/deezer-server";
import { noStoreJson, requireRequestUser } from "../../../../lib/request-security";

export async function GET(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  return noStoreJson({ configured: deezerIsConfigured(), ...await deezerConnectionStatus(user.userId) });
}
