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
    // Max Hamming distance (out of 64) for a perceptual-fingerprint soft-binding
    // match when the C2PA manifest is missing. Lower = stricter.
    FINGERPRINT_MAX_DISTANCE: z.coerce
      .number()
      .int()
      .min(0)
      .max(64)
      .default(10),
    // Verify signer certs against a trust list. Default false: the demo certs are
    // intentionally untrusted in dev (untrusted ≠ tampered).
    C2PA_VERIFY_TRUST: z.coerce.boolean().default(false),
    // Optional PEM bundle of trust anchors used when C2PA_VERIFY_TRUST is on.
    C2PA_TRUST_ANCHORS_PATH: z.string().optional(),
    // Optional CAWG identity-assertion signer certs. When unset, the dev-only
    // demo signing certs are reused (untrusted).
    C2PA_CAWG_CERT_PATH: z.string().optional(),
    C2PA_CAWG_KEY_PATH: z.string().optional(),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
