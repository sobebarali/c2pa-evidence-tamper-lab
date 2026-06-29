import { ORPCError } from "@orpc/server";

// The oRPC error taxonomy for the API layer. These are for malformed requests
// and tool crashes — NOT for verification outcomes. A tampered image is a
// SUCCESSFUL `verify` call returning `status: "tampered"`, never an error here.
const STATUS_BY_CODE = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  TOOL_ERROR: 502,
  UNKNOWN: 500,
} as const;

export type RouterErrorCode = keyof typeof STATUS_BY_CODE;

interface RouterErrorOptions {
  cause?: unknown;
  data?: unknown;
  message?: string;
}

// Routers never construct `new ORPCError(...)` directly — always `routerError(...)`.
export function routerError(
  code: RouterErrorCode,
  options: RouterErrorOptions = {}
) {
  return new ORPCError(code, { ...options, status: STATUS_BY_CODE[code] });
}
