#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use base64::{engine::general_purpose, Engine as _};

#[tauri::command]
fn read_pdf_as_base64(path: String) -> Result<String, String> {
    let buffer = fs::read(path).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(&buffer))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_pdf_as_base64])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
