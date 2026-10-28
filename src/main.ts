import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";

const iframe = document.getElementById("viewer") as HTMLIFrameElement;
const uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement;
const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;

let currentUrl: string | null = null;
let currentPath: string | null = null;
let currentBytes: Uint8Array | null = null;

async function showPdf(filePath: string) {
  try {
    const base64 = await invoke<string>("read_pdf_as_base64", {
      path: filePath,
    });
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = url;
    currentPath = filePath;
    currentBytes = bytes;
    exportBtn.disabled = false;
    iframe.src = url;
    iframe.style.display = "block";
  } catch (err) {
    alert("PDF를 열 수 없습니다: " + err);
    console.error(err);
  }
}

uploadBtn.addEventListener("click", async () => {
  const selected = await open({
    multiple: false,
    filters: [{ name: "PDF Files", extensions: ["pdf"] }],
  });

  if (typeof selected === "string") {
    await showPdf(selected);
  }
});

const isPdf = (path: string) => path.toLowerCase().endsWith(".pdf");

getCurrentWebview().onDragDropEvent(async (event) => {
  const { type } = event.payload;
  if (type === "enter") {
    document.body.classList.toggle("dragging", event.payload.paths.some(isPdf));
  } else if (type === "leave") {
    document.body.classList.remove("dragging");
  } else if (type === "drop") {
    document.body.classList.remove("dragging");
    const pdf = event.payload.paths.find(isPdf);
    if (pdf) await showPdf(pdf);
  }
});

const startupPdf = await invoke<string | null>("get_startup_pdf");
if (startupPdf) await showPdf(startupPdf);

async function exportMarkdown() {
  if (!currentBytes || !currentPath) return;
  exportBtn.disabled = true;
  const label = exportBtn.textContent;
  exportBtn.textContent = "변환 중…";
  try {
    const [pdfjs, { default: workerUrl }, { pdfToMarkdown }] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      import("./pdfToMarkdown"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({
      data: currentBytes.slice(),
      cMapUrl: "/cmaps/",
      cMapPacked: true,
    });
    const markdown = await pdfToMarkdown(await task.promise);
    await task.destroy();

    if (markdown.trim().length < 20) {
      alert("텍스트를 찾을 수 없습니다. 스캔한 이미지 PDF는 내보낼 수 없습니다.");
      return;
    }

    const target = await save({
      defaultPath: currentPath.replace(/\.pdf$/i, ".md"),
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!target) return;
    await invoke("write_text_file", { path: target, contents: markdown });
    alert("Markdown 파일로 저장했습니다.");
  } catch (err) {
    alert("내보내기 중 오류가 발생했습니다: " + err);
    console.error(err);
  } finally {
    exportBtn.textContent = label;
    exportBtn.disabled = false;
  }
}

exportBtn.addEventListener("click", exportMarkdown);
