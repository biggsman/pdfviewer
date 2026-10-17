import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

const iframe = document.getElementById("viewer") as HTMLIFrameElement;
const uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement;

let currentUrl: string | null = null;

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
