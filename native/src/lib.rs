#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

use ignore::WalkBuilder;
use std::path::Path;
use rayon::prelude::*;
use regex::Regex;

#[napi]
pub fn hello_rust() -> String {
  "Project Fast-Core is alive!".to_string()
}

#[napi]
pub fn scan_files(root_path: String, ignore_patterns: Vec<String>) -> Vec<String> {
  let mut files = Vec::new();
  let root = Path::new(&root_path);

  if !root.exists() {
    return files;
  }

  let walker = WalkBuilder::new(root)
    .standard_filters(true)
    .hidden(true)
    .build();

  for entry in walker {
    if let Ok(entry) = entry {
      if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
        let path = entry.path();
        let path_str = path.to_string_lossy().to_string();
        let mut should_ignore = false;
        for pattern in &ignore_patterns {
          if path_str.contains(pattern) {
            should_ignore = true;
            break;
          }
        }

        if !should_ignore {
          files.push(path_str);
        }
      }
    }
  }

  files
}

#[napi]
pub fn parse_files_basic(files: Vec<String>) -> Vec<bool> {
  files.into_par_iter()
    .map(|file_path| {
      if let Ok(content) = std::fs::read_to_string(&file_path) {
        !content.is_empty()
      } else {
        false
      }
    })
    .collect()
}

#[napi]
pub fn count_tech_debt_native(files: Vec<String>) -> i32 {
  // TODO, FIXME, HACK, XXX 탐지를 위한 대소문자 무시 정규식
  let re = Regex::new(r"(?i)(TODO|FIXME|HACK|XXX)").unwrap();

  // Rayon을 사용한 병렬 처리 및 결과 합산
  files.into_par_iter()
    .map(|file_path| {
      if let Ok(content) = std::fs::read_to_string(&file_path) {
        re.find_iter(&content).count() as i32
      } else {
        0
      }
    })
    .sum()
}
