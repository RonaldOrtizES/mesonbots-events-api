import { app } from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
  console.info("[SERVICE] mesonbots-events-api listening", {
    port: env.PORT,
    nodeEnv: env.NODE_ENV
  });
});
