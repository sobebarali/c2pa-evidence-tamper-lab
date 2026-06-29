import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { recordsRouter } from "./records";
import { signRouter } from "./sign";
import { tamperRouter } from "./tamper";
import { uploadRouter } from "./upload";
import { verifyRouter } from "./verify";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  upload: uploadRouter,
  sign: signRouter,
  tamper: tamperRouter,
  verify: verifyRouter,
  records: recordsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
