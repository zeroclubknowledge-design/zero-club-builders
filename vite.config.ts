import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => {
  const isVercelBuild = process.env.VERCEL === "1" || process.env.NITRO_PRESET === "vercel";
  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Registration is handled once in RootComponent. Keeping the plugin
      // from injecting a second registrar gives every install one update path.
      injectRegister: false,
      // "prompt", not "autoUpdate". autoUpdate makes the injected registration
      // reload the page the moment a new service worker takes control, which
      // happens whenever the app regains focus after a deploy — so leaving the
      // app and coming back threw away whatever you were doing. With "prompt"
      // the new version is picked up on the next cold start instead.
      registerType: "prompt",
      includeAssets: ["logo.png", "favicon.ico"],
      manifest: {
        // A stable identity for the app. Browsers and app stores use this
        // instead of the URL, so the install stays recognised even if
        // start_url or the domain changes later. It matches the previous
        // implicit id (start_url) so existing installs are not orphaned.
        id: "/app",
        name: "Zero Club",
        short_name: "ZeroClub",
        description:
          "The social network for builders. Learn in live bootcamps, ship work in public, join focused clubs, and turn proof of work into reputation and income.",
        categories: ["education", "social", "productivity"],
        lang: "en",
        dir: "ltr",
        theme_color: "#f4f2ef",
        background_color: "#f4f2ef",
        display: "standalone",
        /*
         * "any", not "portrait".
         *
         * The comment here used to claim portrait did not lock rotation. It
         * does — for an installed app the manifest orientation is a hard lock
         * the page cannot override, which is exactly why turning the phone
         * sideways in a live class did nothing for anyone who had installed
         * Zero Club, and worked fine for everyone still in a browser tab.
         *
         * Rotation is now allowed at the manifest level and managed in the
         * app: portrait is locked on ordinary screens, and the live room
         * releases the lock so a class can be watched full-width. See
         * useOrientationLock.
         */
        orientation: "any",
        scope: "/",
        start_url: "/app",
        // Icons are declared at their true pixel sizes. /logo.png is 1250x1250,
        // so it was previously mis-declared as 512x512 - installers and the
        // Bubblewrap TWA generator both pick icons by declared size, so the
        // mismatch made icon selection unreliable.
        //
        // "maskable" must be a distinct, fully opaque asset with the artwork
        // inside the 80% safe circle. Reusing the transparent edge-to-edge
        // logo meant Android cropped the star points and composited the
        // remainder onto an undefined background.
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/icons/icon-monochrome-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "monochrome"
          },
          // Retained so anything already referencing the original asset, and
          // any install created before this change, keeps resolving.
          { src: "/logo.png", sizes: "1250x1250", type: "image/png", purpose: "any" }
        ],
        screenshots: [
          // Phone (narrow). All share one aspect ratio, as required.
          {
            src: "/screenshots/screenshot-feed.png",
            sizes: "1080x1920",
            type: "image/png",
            form_factor: "narrow",
            label: "Your feed of shipped work and verified proof"
          },
          {
            src: "/screenshots/screenshot-bootcamps.png",
            sizes: "1080x1920",
            type: "image/png",
            form_factor: "narrow",
            label: "Live bootcamps taught by working professionals"
          },
          {
            src: "/screenshots/screenshot-wallet.png",
            sizes: "1080x1920",
            type: "image/png",
            form_factor: "narrow",
            label: "A creator wallet for earnings, payments and withdrawals"
          },
          {
            src: "/screenshots/screenshot-clubs.png",
            sizes: "1080x1920",
            type: "image/png",
            form_factor: "narrow",
            label: "Private clubs for cohorts, teams and creators"
          },
          // Desktop (wide).
          {
            src: "/screenshots/screenshot-desktop-feed.png",
            sizes: "1920x1080",
            type: "image/png",
            form_factor: "wide",
            label: "The Zero Club workspace on desktop"
          },
          {
            src: "/screenshots/screenshot-desktop-bootcamps.png",
            sizes: "1920x1080",
            type: "image/png",
            form_factor: "wide",
            label: "Browse and join bootcamps on desktop"
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ];

  if (command === "build" && !isVercelBuild) {
    plugins.push(cloudflare({ viteEnvironment: { name: "ssr" } }));
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src")
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core"
      ]
    }
  };
});
