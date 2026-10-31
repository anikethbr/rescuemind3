import { createServer } from "node:http";
import { config } from "./server/config.js";
import { createApp } from "./server/app.js";

const server = createServer(createApp());

server.listen(config.port, config.host, () => {
  console.log(`RescueMind listening on ${config.host}:${config.port}`);
});

server.on("error", (error) => {
  console.error("RescueMind server failed to start:", error);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close((error) => {
      if (error) {
        console.error("RescueMind shutdown failed:", error);
        process.exitCode = 1;
      }
    });
  });
}
