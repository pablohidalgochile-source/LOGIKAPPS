import { requireRequestUser } from "../../../../lib/request-security";
import { handleAcrCloudStatusRequest } from "../../../../lib/acrcloud-server";
import { currentAcrCloudEnv } from "../../../../lib/acrcloud-runtime";

export function GET(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  return handleAcrCloudStatusRequest(request, currentAcrCloudEnv());
}
