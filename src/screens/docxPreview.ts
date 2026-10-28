/** Serialize renderer output for an opaque-origin, network-blocked iframe. */
export function docxPreviewHtml(body: HTMLElement, styles: HTMLElement) {
  // Remove active elements/navigation as well as using a sandbox and CSP.
  for (const root of [body, styles]) {
    root
      .querySelectorAll('script,iframe,object,embed,form,link,meta')
      .forEach((node) => node.remove())
    root.querySelectorAll('*').forEach((node) => {
      for (const attr of [...node.attributes]) {
        if (
          /^on/i.test(attr.name) ||
          /^(?:href|xlink:href|action|formaction|srcdoc)$/i.test(attr.name) ||
          (attr.name === 'src' && !/^data:image\//i.test(attr.value))
        )
          node.removeAttribute(attr.name)
      }
    })
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{margin:0;overflow-wrap:anywhere}.docx-wrapper{padding:12px!important}.docx{max-width:100%;box-sizing:border-box}img{max-width:100%;height:auto}</style>${styles.innerHTML}</head><body>${body.innerHTML}</body></html>`
}
