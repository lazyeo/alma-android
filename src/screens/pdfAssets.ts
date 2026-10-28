// Vite emits these package assets locally; no CDN or public-tree copies.
const assets = import.meta.glob<string>(
  '/node_modules/pdfjs-dist/{cmaps,standard_fonts,wasm}/*.{bcmap,pfb,ttf,wasm,js}',
  { eager: true, query: '?url', import: 'default' },
)
const folders: Record<string, string> = {
  cMapUrl: 'cmaps',
  standardFontDataUrl: 'standard_fonts',
  wasmUrl: 'wasm',
}
export class LocalPdfDataFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }) {
    const url = assets[`/node_modules/pdfjs-dist/${folders[kind]}/${filename}`]
    if (!url) throw new Error('Unknown PDF asset')
    const response = await fetch(url)
    if (!response.ok) throw new Error('PDF asset unavailable')
    return new Uint8Array(await response.arrayBuffer())
  }
}
