import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    // Directory where uploaded/signed/tampered image bytes are stored on disk
    // (referenced by file id; served via GET /files/:id).
    DATA_DIR: z.string().default("./.data"),
    // Max accepted upload size in bytes (default 10 MiB).
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),
    // Optional overrides for the C2PA signer. When unset, the dev-only demo
    // certs in fixtures/dev-certs/ are used. The key is read server-side only —
    // never stored, returned, or exported.
    C2PA_SIGN_CERT_PATH: z.string().optional(),
    C2PA_PRIVATE_KEY_PATH: z.string().optional(),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
