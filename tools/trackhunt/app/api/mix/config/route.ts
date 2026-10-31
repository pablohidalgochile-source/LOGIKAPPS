import { requireRequestUser } from "../../../../lib/request-security";
import { handleAcrCloudConfigRequest } from "../../../../lib/acrcloud-server";
import { currentAcrCloudEnv } from "../../../../lib/acrcloud-runtime";

export function GET(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  return handleAcrCloudConfigRequest(request, currentAcrCloudEnv());
}
