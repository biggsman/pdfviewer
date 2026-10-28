<div align="center">
  <img src="assets/logo-1250x1250.png" width="120" alt="PdfViewer logo" />
  <h1>PdfViewer</h1>
  <p>열어서 보기만 하는 가볍고 빠른 PDF 뷰어</p>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri" />
  <img src="https://img.shields.io/badge/Vite-7.0-yellow?logo=vite" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-informational?logo=typescript" />
  <img src="https://img.shields.io/badge/Rust-stable-orange?logo=rust" />
</p>

---

## 📦 소개

**PdfViewer**는 PDF 파일을 열어서 보는 기능만 가진 데스크톱 앱입니다.
불필요한 기능을 모두 덜어내 가볍고 빠르게 동작하도록 만들었습니다.

- 상단의 **열기** 버튼을 누르고 PDF를 고르면 바로 화면에 표시됩니다.
- 파일은 원래 위치에서 그대로 읽으며, 다른 폴더로 복사하지 않습니다.
- 다른 PDF를 보려면 **열기**를 다시 누르면 됩니다.
- 확대/축소, 페이지 이동, 검색, 저장은 내장 PDF 뷰어 도구 모음을 사용합니다.

---

## 🧰 사용 기술

| 기술                       | 용도                     |
| -------------------------- | ------------------------ |
| Tauri 2                    | 데스크톱 앱 셸           |
| TypeScript + Vite          | 화면 로직 및 번들링      |
| Rust                       | PDF 파일 읽기            |
| @tauri-apps/plugin-dialog  | 파일 선택 창             |

---

## 📁 프로젝트 구조

```plaintext
📁 pdfviewer
├── index.html                → 화면 구성과 스타일
├── 📁 src/
│   └── main.ts               → 열기 버튼, PDF 표시 로직
└── 📁 src-tauri/
    ├── src/main.rs           → PDF 읽기 커맨드
    ├── capabilities/         → 권한 설정
    └── tauri.conf.json       → 창 크기, 번들 설정
```

---

## 🚀 실행 방법

### 준비물

- Node.js 18 이상
- Rust 툴체인 (cargo)
- [Tauri 사전 요구사항](https://tauri.app/start/prerequisites/)

### 개발 모드로 실행

```bash
git clone https://github.com/biggsman/pdfviewer.git
cd pdfviewer
npm install
npm run tauri dev
```

---

## 🏗️ 빌드

```bash
npm run tauri build
```

| 결과물              | 위치                                                              |
| ------------------- | ----------------------------------------------------------------- |
| 실행 파일           | `src-tauri/target/release/pdfviewer.exe`                          |
| Windows 설치 (.msi) | `src-tauri/target/release/bundle/msi/pdfviewer_0.3.0_x64_en-US.msi` |
| Windows 설치 (.exe) | `src-tauri/target/release/bundle/nsis/pdfviewer_0.3.0_x64-setup.exe` |
| Linux 설치 (.deb)   | `src-tauri/target/release/bundle/deb/pdfviewer_0.3.0_amd64.deb`   |

> Linux에서 빌드하려면 `libwebkit2gtk` 등 Tauri 사전 요구사항이 설치되어 있어야 합니다.

---

## 🙏 출처

이 프로젝트는 [taberkkaya/PdfViewer](https://github.com/taberkkaya/PdfViewer)를 바탕으로 기능을 단순화해 만들었습니다.
