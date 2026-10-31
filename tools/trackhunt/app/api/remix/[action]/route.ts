import { handleMusicRequest } from "../../../../lib/remix-server";
import { mutationSecurityError, requireRequestUser } from "../../../../lib/request-security";

function handle(request: Request) {
  return handleMusicRequest(request, {
    AUDD_API_TOKEN: process.env.AUDD_API_TOKEN,
    BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY,
    SOUNDCLOUD_CLIENT_ID: process.env.SOUNDCLOUD_CLIENT_ID,
    SOUNDCLOUD_CLIENT_SECRET: process.env.SOUNDCLOUD_CLIENT_SECRET,
  });
}
export const GET = handle;

export function POST(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  const securityError = mutationSecurityError(request, undefined, new URL(request.url).pathname.endsWith("/recognize") ? 1_000_000 : 128_000);
  if (securityError) return securityError;
  return handle(request);
}
