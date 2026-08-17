import express from "express";
import { registerRoutes } from "../server/routes.js";

const app = express();

app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// Initialize routing asynchronously for Serverless invocations
let serverInitPromise: Promise<any> | null = null;

app.use(async (req, res, next) => {
  if (!serverInitPromise) {
    serverInitPromise = registerRoutes(app);
  }
  await serverInitPromise;
  next();
});

export default app;
