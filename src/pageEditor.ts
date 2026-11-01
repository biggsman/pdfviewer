import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import type { PDFDocument } from "pdf-lib";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { openPdfjsDocument } from "./pdfjs";

export interface PdfFile {
  path: string;
  bytes: Uint8Array;
}

interface Hooks {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  onClose(savedPath: string | null): void;
}

interface Source {
  file: PdfFile;
  task: PDFDocumentLoadingTask;
  doc: PDFDocumentProxy;
}

interface PageRef {
  id: number;
  src: number;
  index: number;
  rotation: number;
}

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const editor = byId<HTMLElement>("editor");
const grid = byId<HTMLDivElement>("editorGrid");
const info = byId<HTMLSpanElement>("editorInfo");
const rotLeftBtn = byId<HTMLButtonElement>("rotLeftBtn");
const rotRightBtn = byId<HTMLButtonElement>("rotRightBtn");
const deleteBtn = byId<HTMLButtonElement>("deleteBtn");
const insertBtn = byId<HTMLButtonElement>("insertBtn");
const extractBtn = byId<HTMLButtonElement>("extractBtn");
const saveAsBtn = byId<HTMLButtonElement>("saveAsBtn");
const closeEditorBtn = byId<HTMLButtonElement>("closeEditorBtn");
const toolbarButtons = [rotLeftBtn, rotRightBtn, deleteBtn, insertBtn, extractBtn, saveAsBtn, closeEditorBtn];

let hooks: Hooks | null = null;
let sources: Source[] = [];
let pages: PageRef[] = [];
let selected = new Set<number>();
let anchor: number | null = null;
let nextId = 1;
let dirty = false;
let busy = false;

const thumbs = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const thumbKey = (p: PageRef) => `${p.src}:${p.index}`;
const observer = new IntersectionObserver(onVisible, { root: grid, rootMargin: "300px" });

const PDF_FILTER = [{ name: "PDF Files", extensions: ["pdf"] }];
const baseName = (path: string) => path.split(/[\\/]/).pop()!.replace(/\.pdf$/i, "");
const dirName = (path: string) => path.slice(0, Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/")) + 1);
const errorText = (err: unknown) => String(err instanceof Error ? err.message : err);

export function isEditorOpen(): boolean {
  return !editor.hidden;
}

export async function openEditor(files: PdfFile[], h: Hooks): Promise<void> {
  hooks = h;
  sources = [];
  pages = [];
  selected = new Set();
  anchor = null;
  dirty = files.length > 1;
  editor.hidden = false;
  grid.replaceChildren();
  info.textContent = "페이지를 불러오는 중…";
  try {
    await addSources(files, 0);
  } catch (err) {
    alert(errorText(err));
    await closeEditor(null);
    return;
  }
  render();
}

async function addSources(files: PdfFile[], at: number): Promise<PageRef[]> {
  const added: PageRef[] = [];
  for (const file of files) {
    const task = await openPdfjsDocument(file.bytes);
    let doc: PDFDocumentProxy;
    try {
      doc = await task.promise;
    } catch {
      await task.destroy();
      throw new Error(`${baseName(file.path)}.pdf 파일을 열 수 없습니다. 암호가 걸린 PDF는 편집할 수 없습니다.`);
    }
    const src = sources.push({ file, task, doc }) - 1;
    for (let i = 0; i < doc.numPages; i++) {
      added.push({ id: nextId++, src, index: i, rotation: 0 });
    }
  }
  pages.splice(at, 0, ...added);
  return added;
}

function render() {
  observer.disconnect();
  grid.replaceChildren(...pages.map(card));
  updateToolbar();
}

function card(p: PageRef, i: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "page-card" + (selected.has(p.id) ? " selected" : "");
  el.dataset.id = String(p.id);
  if (sources.length > 1) el.title = `${baseName(sources[p.src].file.path)} · ${p.index + 1}쪽`;

  const box = document.createElement("div");
  box.className = "thumb";
  const img = document.createElement("img");
  img.draggable = false;
  img.style.transform = `rotate(${p.rotation}deg)`;
  const url = thumbs.get(thumbKey(p));
  if (url) img.src = url;
  else observer.observe(el);
  box.append(img);

  const label = document.createElement("span");
  label.textContent = String(i + 1);
  el.append(box, label);
  return el;
}

function onVisible(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    const el = entry.target as HTMLElement;
    const page = pages.find((p) => p.id === Number(el.dataset.id));
    if (!page) continue;
    renderThumb(page).then((url) => {
      const img = el.querySelector("img");
      if (img) img.src = url;
    }, console.error);
  }
}

function renderThumb(p: PageRef): Promise<string> {
  const key = thumbKey(p);
  const cached = thumbs.get(key);
  if (cached) return Promise.resolve(cached);
  let job = pending.get(key);
  if (!job) {
    job = (async () => {
      const page = await sources[p.src].doc.getPage(p.index + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 300 / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
      const url = canvas.toDataURL("image/jpeg", 0.85);
      thumbs.set(key, url);
      pending.delete(key);
      return url;
    })();
    pending.set(key, job);
  }
  return job;
}

function updateToolbar() {
  const none = selected.size === 0;
  for (const btn of toolbarButtons) btn.disabled = busy;
  if (!busy) {
    rotLeftBtn.disabled = rotRightBtn.disabled = deleteBtn.disabled = extractBtn.disabled = none;
  }
  info.textContent = `${pages.length}쪽` + (none ? "" : ` · ${selected.size}쪽 선택`) + (dirty ? " · 저장 안 됨" : "");
}

function rotate(delta: number) {
  for (const p of pages) {
    if (selected.has(p.id)) p.rotation = (p.rotation + delta + 360) % 360;
  }
  dirty = true;
  render();
}

function deleteSelected() {
  if (!selected.size) return;
  if (selected.size === pages.length) {
    alert("모든 페이지를 지울 수는 없습니다.");
    return;
  }
  pages = pages.filter((p) => !selected.has(p.id));
  selected.clear();
  dirty = true;
  render();
}

function moveSelected(targetId: number, before: boolean) {
  if (selected.has(targetId)) return;
  const moving = pages.filter((p) => selected.has(p.id));
  const rest = pages.filter((p) => !selected.has(p.id));
  const at = rest.findIndex((p) => p.id === targetId) + (before ? 0 : 1);
  rest.splice(at, 0, ...moving);
  pages = rest;
  dirty = true;
  render();
}

async function buildPdf(list: PageRef[]): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const out = await PDFDocument.create();
  const loaded = new Map<number, PDFDocument>();
  for (const p of list) {
    let lib = loaded.get(p.src);
    if (!lib) {
      const file = sources[p.src].file;
      try {
        lib = await PDFDocument.load(file.bytes);
      } catch {
        throw new Error(`${baseName(file.path)}.pdf 파일은 편집할 수 없습니다. 암호가 걸린 PDF일 수 있습니다.`);
      }
      loaded.set(p.src, lib);
    }
    const [copied] = await out.copyPages(lib, [p.index]);
    copied.setRotation(degrees((copied.getRotation().angle + p.rotation) % 360));
    out.addPage(copied);
  }
  return out.save();
}

async function withBusy(label: string, work: () => Promise<void>) {
  busy = true;
  updateToolbar();
  info.textContent = label;
  try {
    await work();
  } catch (err) {
    alert(errorText(err));
    console.error(err);
  } finally {
    busy = false;
    if (!editor.hidden) updateToolbar();
  }
}

async function insertPdfs(where: "before" | "after" = "after") {
  const chosen = await open({ multiple: true, filters: PDF_FILTER });
  if (!chosen || !hooks) return;
  const paths = Array.isArray(chosen) ? chosen : [chosen];
  const readFile = hooks.readFile;
  await withBusy("PDF를 불러오는 중…", async () => {
    const files: PdfFile[] = [];
    for (const path of paths) files.push({ path, bytes: await readFile(path) });
    const firstSelected = pages.findIndex((p) => selected.has(p.id));
    const lastSelected = pages.reduce((last, p, i) => (selected.has(p.id) ? i : last), -1);
    const at = where === "before" ? Math.max(firstSelected, 0) : lastSelected >= 0 ? lastSelected + 1 : pages.length;
    const added = await addSources(files, at);
    selected = new Set(added.map((p) => p.id));
    dirty = true;
    render();
  });
}

async function savePages(list: PageRef[], suffix: string): Promise<string | null> {
  const first = sources[0].file.path;
  const target = await save({ defaultPath: `${dirName(first)}${baseName(first)}_${suffix}.pdf`, filters: PDF_FILTER });
  if (!target || !hooks) return null;
  const bytes = await buildPdf(list);
  await hooks.writeFile(target, bytes);
  return target;
}

async function extractSelected() {
  const list = pages.filter((p) => selected.has(p.id));
  if (!list.length) return;
  await withBusy("추출하는 중…", async () => {
    const target = await savePages(list, "추출");
    if (target) alert(`선택한 ${list.length}쪽을 새 PDF로 저장했습니다.`);
  });
}

async function saveAs() {
  let saved: string | null = null;
  await withBusy("저장하는 중…", async () => {
    saved = await savePages(pages, sources.length > 1 ? "병합" : "편집");
  });
  if (saved) {
    dirty = false;
    await closeEditor(saved);
  }
}

async function requestClose() {
  if (dirty && !(await confirm("저장하지 않은 변경 사항이 있습니다. 편집을 닫을까요?", { title: "페이지 편집", kind: "warning" }))) return;
  await closeEditor(null);
}

async function closeEditor(savedPath: string | null) {
  hideMenu();
  observer.disconnect();
  grid.replaceChildren();
  editor.hidden = true;
  await Promise.all(sources.map((s) => s.task.destroy()));
  sources = [];
  pages = [];
  thumbs.clear();
  pending.clear();
  hooks?.onClose(savedPath);
}

rotLeftBtn.addEventListener("click", () => rotate(-90));
rotRightBtn.addEventListener("click", () => rotate(90));
deleteBtn.addEventListener("click", deleteSelected);
insertBtn.addEventListener("click", () => insertPdfs("after"));
extractBtn.addEventListener("click", extractSelected);
saveAsBtn.addEventListener("click", saveAs);
closeEditorBtn.addEventListener("click", requestClose);

// 썸네일 우클릭 메뉴
const contextMenu = byId<HTMLDivElement>("pageMenu");
const menuActions: Record<string, () => void> = {
  "rotate-left": () => rotate(-90),
  "rotate-right": () => rotate(90),
  delete: deleteSelected,
  "insert-before": () => insertPdfs("before"),
  "insert-after": () => insertPdfs("after"),
  extract: extractSelected,
};

function hideMenu() {
  contextMenu.hidden = true;
}

editor.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (busy) return;
  const el = (e.target as HTMLElement).closest<HTMLElement>(".page-card");
  if (!el) {
    hideMenu();
    return;
  }
  const id = Number(el.dataset.id);
  if (!selected.has(id)) {
    selected = new Set([id]);
    anchor = id;
    render();
  }
  const count = contextMenu.querySelector<HTMLElement>("[data-count]");
  if (count) count.textContent = selected.size > 1 ? `${selected.size}쪽 선택됨` : `${pages.findIndex((p) => p.id === id) + 1}쪽`;
  contextMenu.hidden = false;
  const { innerWidth, innerHeight } = window;
  const { offsetWidth: w, offsetHeight: h } = contextMenu;
  contextMenu.style.left = `${Math.min(e.clientX, innerWidth - w - 4)}px`;
  contextMenu.style.top = `${Math.min(e.clientY, innerHeight - h - 4)}px`;
});

contextMenu.addEventListener("click", (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!item) return;
  hideMenu();
  menuActions[item.dataset.action!]?.();
});

document.addEventListener("pointerdown", (e) => {
  if (!contextMenu.hidden && !contextMenu.contains(e.target as Node)) hideMenu();
});
grid.addEventListener("scroll", hideMenu);
window.addEventListener("blur", hideMenu);

document.addEventListener("keydown", (e) => {
  if (editor.hidden || busy) return;
  if (e.key === "Escape") hideMenu();
  else if (e.key === "Delete") deleteSelected();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
    e.preventDefault();
    selected = new Set(pages.map((p) => p.id));
    render();
  }
});

// 끌어서 순서 바꾸기. Tauri가 파일 드롭을 가로채므로 HTML 드래그 대신 포인터 이벤트로 처리한다.
let drag: { id: number; x: number; y: number; active: boolean } | null = null;
let dropTarget: { id: number; before: boolean } | null = null;

function clearDropMarks() {
  grid.querySelectorAll(".drop-before, .drop-after").forEach((el) => el.classList.remove("drop-before", "drop-after"));
}

grid.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || busy) return;
  const el = (e.target as HTMLElement).closest<HTMLElement>(".page-card");
  if (!el) {
    selected.clear();
    render();
    return;
  }
  const id = Number(el.dataset.id);
  if (e.ctrlKey || e.metaKey) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    anchor = id;
    render();
    return;
  }
  if (e.shiftKey && anchor !== null) {
    const a = pages.findIndex((p) => p.id === anchor);
    const b = pages.findIndex((p) => p.id === id);
    selected = new Set(pages.slice(Math.min(a, b), Math.max(a, b) + 1).map((p) => p.id));
    render();
    return;
  }
  if (!selected.has(id)) {
    selected = new Set([id]);
    anchor = id;
    render();
  }
  drag = { id, x: e.clientX, y: e.clientY, active: false };
  grid.setPointerCapture(e.pointerId);
});

grid.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.active = true;
    grid.classList.add("dragging-pages");
  }
  const rect = grid.getBoundingClientRect();
  if (e.clientY < rect.top + 40) grid.scrollTop -= 20;
  else if (e.clientY > rect.bottom - 40) grid.scrollTop += 20;

  clearDropMarks();
  dropTarget = null;
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".page-card");
  if (!target) return;
  const id = Number(target.dataset.id);
  if (selected.has(id)) return;
  const box = target.getBoundingClientRect();
  const before = e.clientX < box.left + box.width / 2;
  target.classList.add(before ? "drop-before" : "drop-after");
  dropTarget = { id, before };
});

grid.addEventListener("pointerup", () => {
  if (!drag) return;
  const { id, active } = drag;
  drag = null;
  grid.classList.remove("dragging-pages");
  clearDropMarks();
  if (active) {
    if (dropTarget) moveSelected(dropTarget.id, dropTarget.before);
  } else if (selected.size > 1) {
    selected = new Set([id]);
    anchor = id;
    render();
  }
  dropTarget = null;
});

grid.addEventListener("pointercancel", () => {
  drag = null;
  dropTarget = null;
  grid.classList.remove("dragging-pages");
  clearDropMarks();
});
