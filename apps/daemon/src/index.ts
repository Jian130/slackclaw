import { startServer } from "./server.js";
import { errorToLogDetails, formatConsoleLine, writeErrorLog } from "./services/logger.js";

const port = Number(process.env.CHILLCLAW_PORT ?? "4545");
const server = startServer(port);

server.on("listening", () => {
  console.log(
    formatConsoleLine(`ChillClaw daemon listening on http://127.0.0.1:${port}`, {
      scope: "index.serverListening"
    })
  );
});

process.on("uncaughtException", (error) => {
  void writeErrorLog("Uncaught exception in ChillClaw daemon.", errorToLogDetails(error), {
    scope: "index.uncaughtException"
  });
});

process.on("unhandledRejection", (reason) => {
  void writeErrorLog("Unhandled rejection in ChillClaw daemon.", errorToLogDetails(reason), {
    scope: "index.unhandledRejection"
  });
});
