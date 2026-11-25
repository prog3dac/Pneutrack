/// <reference types="vite/client" />

/** versione dell'app (package.json), iniettata da Vite */
declare const __APP_VERSION__: string;

declare module "*.md?raw" {
  const text: string;
  export default text;
}
