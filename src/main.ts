import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { isEditorOpen, openEditor, type PdfFile } from "./pageEditor";
import { openPdfjsDocument } from "./pdfjs";

const iframe = document.getElementById("viewer") as HTMLIFrameElement;
const uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement;
const editBtn = document.getElementById("editBtn") as HTMLButtonElement;
const mergeBtn = document.getElementById("mergeBtn") as HTMLButtonElement;
const printBtn = document.getElementById("printBtn") as HTMLButtonElement;
const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;

const PDF_FILTER = [{ name: "PDF Files", extensions: ["pdf"] }];

let currentUrl: string | null = null;
let currentPath: string | null = null;
let currentBytes: Uint8Array | null = null;

async function readPdf(path: string): Promise<Uint8Array> {
  const base64 = await invoke<string>("read_pdf_as_base64", { path });
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function writePdf(path: string, bytes: Uint8Array): Promise<void> {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  await invoke("write_binary_file", { path, contents: btoa(binary) });
}

async function showPdf(filePath: string) {
  try {
    const bytes = await readPdf(filePath);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = url;
    currentPath = filePath;
    currentBytes = bytes;
    exportBtn.disabled = editBtn.disabled = printBtn.disabled = false;
    iframe.src = url;
    iframe.style.display = "block";
  } catch (err) {
    alert("PDF를 열 수 없습니다: " + err);
    console.error(err);
  }
}

uploadBtn.addEventListener("click", async () => {
  const selected = await open({ multiple: false, filters: PDF_FILTER });
  if (typeof selected === "string") {
    await showPdf(selected);
  }
});

const isPdf = (path: string) => path.toLowerCase().endsWith(".pdf");

getCurrentWebview().onDragDropEvent(async (event) => {
  if (isEditorOpen()) return;
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

function startEditor(files: PdfFile[]) {
  document.body.classList.add("editing");
  openEditor(files, {
    readFile: readPdf,
    writeFile: writePdf,
    onClose: (savedPath) => {
      document.body.classList.remove("editing");
      if (savedPath) showPdf(savedPath);
    },
  });
}

editBtn.addEventListener("click", () => {
  if (currentBytes && currentPath) startEditor([{ path: currentPath, bytes: currentBytes }]);
});

mergeBtn.addEventListener("click", async () => {
  const chosen = await open({ multiple: true, filters: PDF_FILTER, title: "합칠 PDF를 2개 이상 선택하세요" });
  if (!chosen) return;
  const paths = Array.isArray(chosen) ? chosen : [chosen];
  if (paths.length < 2) {
    alert("합칠 PDF를 2개 이상 선택해 주세요. (Ctrl 또는 Shift를 누른 채로 여러 개를 고를 수 있습니다)");
    return;
  }
  try {
    const files: PdfFile[] = [];
    for (const path of paths) files.push({ path, bytes: await readPdf(path) });
    startEditor(files);
  } catch (err) {
    alert("PDF를 불러오지 못했습니다: " + err);
    console.error(err);
  }
});

printBtn.addEventListener("click", () => {
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
});

async function exportMarkdown() {
  if (!currentBytes || !currentPath) return;
  exportBtn.disabled = true;
  const label = exportBtn.textContent;
  exportBtn.textContent = "변환 중…";
  try {
    const [task, { pdfToMarkdown }] = await Promise.all([
      openPdfjsDocument(currentBytes),
      import("./pdfToMarkdown"),
    ]);
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

const startupPdf = await invoke<string | null>("get_startup_pdf");
if (startupPdf) await showPdf(startupPdf);
