import { mkdirSync } from "fs";
import { loadWordLists } from "./store/wordlists";
import { handlePageRoute } from "./routes/pages";
import { handleAttemptRoute } from "./routes/attempts";
import { handleSettingsRoute } from "./routes/settings";

mkdirSync("data/attempts", { recursive: true });
mkdirSync("data/mappings", { recursive: true });

console.log("Loading word lists...");
const startTime = performance.now();
await loadWordLists("word-lists");
console.log(`Word lists loaded in ${(performance.now() - startTime).toFixed(0)}ms`);

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    try {
      const response =
        handlePageRoute(req) ??
        (await handleAttemptRoute(req)) ??
        (await handleSettingsRoute(req));

      if (response) return response;
      return new Response("Not Found", { status: 404 });
    } catch (e) {
      console.error(e);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});

console.log(`Server running at http://localhost:${server.port}`);
