import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// The API is Vite `apply:"serve"` middleware on the dev server — there is no
// separate backend. See server/api.ts.
import { apiPlugins } from "./server/api.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugins()],
  server: {
    // Listening on the home network is the point: the game is played on a
    // tablet, the Mac keeps the scores. ARCADE_LOCAL_ONLY=1 keeps it to this
    // machine (a café, a hotel). server/origin.ts decides who may call the API.
    host: process.env.ARCADE_LOCAL_ONLY ? "localhost" : true,
    // Vite's own host check admits localhost and bare IP addresses; this
    // adds the Mac's Bonjour name (my-mac.local).
    allowedHosts: [".local"],
    // Fixed port so the tablet's bookmark and the Mac app have one URL;
    // strict so a second instance fails loudly instead of serving a twin on
    // the next port. 38900 = Schoolhouse Arcade; Lean Into It is 38800, Fret
    // Not 38600, jev-ants 38500, Lingo Dojo 38400, Atlas 38300, Wine Guide
    // 38200 and Basecamp 38100.
    port: 38900,
    strictPort: true,
    // Polling watcher: macOS FSEvents delivery is unreliable on this machine,
    // which silently kills HMR.
    watch: { usePolling: true, interval: 300 },
  },
});
