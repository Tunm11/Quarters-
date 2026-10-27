/*
 * The app compiles against DOM types only (`types: ["vite/client"]` in
 * tsconfig.app.json), which is the right default for a browser bundle. One test
 * needs to read a real file from disk — the service worker in `public/`, which no
 * bundler processes — so declare just the two functions it uses rather than
 * pulling the whole Node type surface into the browser compilation.
 */
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
