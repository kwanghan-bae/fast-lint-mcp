#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

use ignore::WalkBuilder;
use std::path::Path;
use rayon::prelude::*;
use regex::Regex;
use std::collections::HashMap;
use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::Direction;

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
  let re = Regex::new(r"(?i)(TODO|FIXME|HACK|XXX)").unwrap();

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

#[napi(object)]
pub struct ImportResult {
  pub file: String,
  pub imports: Vec<String>,
}

#[napi]
pub fn extract_imports_native(files: Vec<String>) -> Vec<ImportResult> {
  let re = Regex::new(r#"(?:import|export)\s+.*?\s+from\s+['"](.*?)['"]|import\(['"](.*?)['"]\)"#).unwrap();

  files.into_par_iter()
    .map(|file_path| {
      let mut imports = Vec::new();
      if let Ok(content) = std::fs::read_to_string(&file_path) {
        for cap in re.captures_iter(&content) {
          if let Some(m) = cap.get(1).or(cap.get(2)) {
            imports.push(m.as_str().to_string());
          }
        }
      }
      ImportResult {
        file: file_path,
        imports,
      }
    })
    .collect()
}

#[napi]
pub fn get_dependents_native(target_file: String, import_map: HashMap<String, Vec<String>>) -> Vec<String> {
  let mut graph = DiGraph::<String, ()>::new();
  let mut nodes = HashMap::new();

  // 1. 모든 파일을 노드로 등록
  for file in import_map.keys() {
    let idx = graph.add_node(file.clone());
    nodes.insert(file.clone(), idx);
  }

  // 2. 엣지(의존성) 등록
  for (file, imports) in &import_map {
    if let Some(&from_idx) = nodes.get(file) {
      for import_path in imports {
        // 실제로는 여기서 Path resolution이 필요하지만, 
        // 일단 전달된 import_map이 이미 resolved 상태라고 가정하거나 단순 매칭 수행
        if let Some(&to_idx) = nodes.get(import_path) {
          graph.add_edge(from_idx, to_idx, ());
        }
      }
    }
  }

  // 3. 타겟 파일을 참조하는(Incoming edge) 파일들 찾기
  let mut dependents = Vec::new();
  if let Some(&target_idx) = nodes.get(&target_file) {
    let mut incoming = graph.neighbors_directed(target_idx, Direction::Incoming);
    while let Some(neighbor_idx) = incoming.next() {
      if let Some(file_name) = graph.node_weight(neighbor_idx) {
        dependents.push(file_name.clone());
      }
    }
  }

  dependents
}
