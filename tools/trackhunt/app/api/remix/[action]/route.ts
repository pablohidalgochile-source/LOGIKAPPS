import { handleMusicRequest } from "../../../../lib/remix-server";
function handle(request: Request) {
  return handleMusicRequest(request, {
    AUDD_API_TOKEN: process.env.AUDD_API_TOKEN,
    BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY,
    SOUNDCLOUD_CLIENT_ID: process.env.SOUNDCLOUD_CLIENT_ID,
    SOUNDCLOUD_CLIENT_SECRET: process.env.SOUNDCLOUD_CLIENT_SECRET,
  });
}
export const GET = handle;
export const POST = handle;
