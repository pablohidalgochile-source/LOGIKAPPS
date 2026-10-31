import { env } from "cloudflare:workers";
import type { AcrCloudEnv } from "./acrcloud-server";

function runtimeValue(key: keyof AcrCloudEnv): string | undefined {
  const bindings = env as unknown as Record<string, unknown>;
  const boundValue = bindings[key];
  if (typeof boundValue === "string") return boundValue;
  return process.env[key];
}

export function currentAcrCloudEnv(): AcrCloudEnv {
  return {
    ACRCLOUD_ACCESS_TOKEN: runtimeValue("ACRCLOUD_ACCESS_TOKEN"),
    ACRCLOUD_CONTAINER_ID: runtimeValue("ACRCLOUD_CONTAINER_ID"),
    ACRCLOUD_REGION: runtimeValue("ACRCLOUD_REGION"),
    ACRCLOUD_FREE_TRIAL_ONLY: runtimeValue("ACRCLOUD_FREE_TRIAL_ONLY"),
  };
}
