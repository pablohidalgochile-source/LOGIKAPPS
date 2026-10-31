import { requireRequestUser } from "../../../../lib/request-security";
import { handleAcrCloudStartRequest } from "../../../../lib/acrcloud-server";
import { currentAcrCloudEnv } from "../../../../lib/acrcloud-runtime";

export function POST(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  return handleAcrCloudStartRequest(request, currentAcrCloudEnv());
}
