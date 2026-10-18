import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { paymentsWebhookRouter } from "./routes/payments";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(cors());
// Mounted before the JSON parser: signatures are verified over the raw bytes.
app.use("/api/payments/webhooks", paymentsWebhookRouter);
// Default 100kb was too small for /state writes: older app builds can send a
// large audit trail. State also accepts legacy primitive values such as the
// report-policy version, so keep strict parsing disabled only on this route.
app.use("/api/state", express.json({ limit: "5mb", strict: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
