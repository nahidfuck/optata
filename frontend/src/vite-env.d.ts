/// <reference types="vite/client" />

// Fontsource packages are CSS-only, no type declarations shipped
declare module "@fontsource-variable/bricolage-grotesque";
declare module "@fontsource-variable/inter";
declare module "@fontsource-variable/jetbrains-mono";

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
