/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHEET_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// pdfjs-dist is loaded via dynamic import() with CDN worker — declare as any
declare module "pdfjs-dist" {
  const pdfjsLib: any
  export = pdfjsLib
}
