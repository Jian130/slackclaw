import { startServer } from "./server.js";

const port = Number(process.env.SLACKCLAW_PORT ?? "4545");
const server = startServer(port);

server.on("listening", () => {
  console.log(`SlackClaw daemon listening on http://127.0.0.1:${port}`);
});
