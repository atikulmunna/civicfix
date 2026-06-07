/** Process entry point: build the app and start listening. */
import { buildApp } from './app.js';
import { env } from './config/env.js';

const app = buildApp();
app.listen(env.PORT, () => {
  console.log(`CivicFix API listening on http://localhost:${env.PORT}`);
});
