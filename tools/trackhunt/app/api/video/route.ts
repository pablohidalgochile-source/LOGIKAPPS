import { handleVideoRequest } from "../../../lib/youtube-video-server";
import { mutationSecurityError, requireRequestUser } from "../../../lib/request-security";

export function POST(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  const securityError = mutationSecurityError(request);
  if (securityError) return securityError;
  return handleVideoRequest(request, {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  });
}
