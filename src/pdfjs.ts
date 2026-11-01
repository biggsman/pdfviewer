import type * as PdfJs from "pdfjs-dist";

let loaded: Promise<typeof PdfJs> | null = null;

// PDF.js는 필요할 때 한 번만 불러온다.
export function loadPdfjs(): Promise<typeof PdfJs> {
  loaded ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([pdfjs, { default: workerUrl }]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  return loaded;
}

export async function openPdfjsDocument(bytes: Uint8Array) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data: bytes.slice(), cMapUrl: "/cmaps/", cMapPacked: true });
}
