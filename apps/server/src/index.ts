import { createContext } from "@c2pa-evidence-tamper-lab/api/context";
import { storage } from "@c2pa-evidence-tamper-lab/api/integrations/storage/index";
import { appRouter } from "@c2pa-evidence-tamper-lab/api/routers/index";
import { db } from "@c2pa-evidence-tamper-lab/db";
import { env } from "@c2pa-evidence-tamper-lab/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { initLogger } from "evlog";
import { type EvlogVariables, evlog } from "evlog/hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";

initLogger({
  env: { service: "c2pa-evidence-tamper-lab-server" },
});

const app = new Hono<EvlogVariables>();

app.use(evlog());

app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
);

// Cap image uploads (they flow through the oRPC /rpc handler).
app.use(
  "/rpc/*",
  bodyLimit({
    maxSize: env.MAX_UPLOAD_BYTES,
    onError: (c) => c.text("Payload too large", 413),
  })
);

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => c.text("OK"));

// Serve stored image bytes by file id (preview/download for the UI).
app.get("/files/:id", async (c) => {
  const row = await storage.getFileRow(db, c.req.param("id"));
  if (!row) {
    return c.notFound();
  }
  try {
    const bytes = await storage.readBytes(row.id);
    return c.newResponse(new Uint8Array(bytes), 200, {
      "Content-Type": row.mime,
      "Cache-Control": "private, max-age=31536000",
    });
  } catch {
    return c.notFound();
  }
});

import { serve } from "@hono/node-server";

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
