import "server-only";

import { getServerEnvironment } from "@/schemas/env";

export const SEC_DATA_HOST = "data.sec.gov";
export const SEC_DATA_BASE_URL = `https://${SEC_DATA_HOST}`;
export const SEC_MAX_REQUESTS_PER_SECOND = 8;

export function getSecConfiguration() {
  const env = getServerEnvironment();

  return {
    configured: Boolean(env.SEC_USER_AGENT),
    baseUrl: SEC_DATA_BASE_URL,
    maxRequestsPerSecond: SEC_MAX_REQUESTS_PER_SECOND,
    headers: {
      "User-Agent": env.SEC_USER_AGENT ?? "",
      "Accept-Encoding": "gzip, deflate",
      Host: SEC_DATA_HOST,
    },
  } as const;
}
