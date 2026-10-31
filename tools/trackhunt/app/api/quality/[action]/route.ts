import { handleQualityRequest } from "../../../../lib/quality-server";

function handle(request: Request) {
  return handleQualityRequest(request, {
    BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY,
  });
}

export const GET = handle;
export const POST = handle;

