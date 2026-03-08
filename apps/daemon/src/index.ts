import { startServer } from "./server.js";
import { errorToLogDetails, writeErrorLog } from "./services/logger.js";

const port = Number(process.env.SLACKCLAW_PORT ?? "4545");
const server = startServer(port);

server.on("listening", () => {
  console.log(`${new Date().toISOString()} SlackClaw daemon listening on http://127.0.0.1:${port}`);
});

process.on("uncaughtException", (error) => {
  void writeErrorLog("Uncaught exception in SlackClaw daemon.", errorToLogDetails(error));
});

process.on("unhandledRejection", (reason) => {
  void writeErrorLog("Unhandled rejection in SlackClaw daemon.", errorToLogDetails(reason));
});
