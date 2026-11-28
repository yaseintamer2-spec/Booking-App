import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sendDueMatchReminders, sendDueRefereeMatchReminders } from "./lib/match-reminders";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

const matchReminderScheduler = setInterval(() => {
  void Promise.all([sendDueMatchReminders(), sendDueRefereeMatchReminders()]).catch((error) => logger.error({ error }, "Could not schedule match reminders"));
}, 60_000);
matchReminderScheduler.unref();
void Promise.all([sendDueMatchReminders(), sendDueRefereeMatchReminders()]).catch((error) => logger.error({ error }, "Could not schedule match reminders"));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
if (process.env.CLERK_SECRET_KEY?.trim()) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
} else {
  logger.error(
    "CLERK_SECRET_KEY is missing; public API routes remain available and authenticated routes will return 503",
  );
}

app.use("/api", router);

const apiErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  const requestId = typeof req.id === "string" ? req.id : undefined;
  logger.error({ err: error, requestId, method: req.method, path: req.path }, "Unhandled API request error");
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(500).json({ error: "The API encountered an unexpected error.", requestId });
};

app.use(apiErrorHandler);

export default app;
