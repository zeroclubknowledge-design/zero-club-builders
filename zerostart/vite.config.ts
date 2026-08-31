import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // fileURLToPath rather than __dirname: this file is an ES module, where
    // __dirname does not exist at runtime and only appeared to work because
    // nothing had type-checked it yet.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
