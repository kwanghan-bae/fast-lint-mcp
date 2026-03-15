#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

use ignore::WalkBuilder;
use ignore::overrides::OverrideBuilder;
use std::path::{Path, PathBuf};
use rayon::prelude::*;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use petgraph::graph::DiGraph;
use petgraph::algo::tarjan_scc;
use serde::{Deserialize, Serialize};
use std::fs;
use once_cell::sync::Lazy;

// 글로벌 정규식 캐시 (성능 최적화)
static TECH_DEBT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)(TODO|FIXME|HACK|XXX)").unwrap());
static SECRET_PATTERNS: Lazy<Vec<(&'static str, Regex, &'static str)>> = Lazy::new(|| vec![
    ("AWS_KEY", Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(), "AWS Access Key가 노출되었습니다!"),
    ("GENERIC_SECRET", Regex::new(r#"(?i)(password|secret|token|key|api_key|auth_token)\s*[:=]\s*['"].{16,}['"]"#).unwrap(), "하드코딩된 비밀번호나 토큰이 발견되었습니다!"),
    ("JWT_TOKEN", Regex::new(r"eyJ[a-zA-Z0-9\._\-]{10,}").unwrap(), "JWT 토큰이 노출되었습니다!"),
]);
static COMPLEXITY_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(if|for|while|switch|catch)\b|(&&|\|\||\?)").unwrap());

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

  let mut override_builder = OverrideBuilder::new(root);
  for pattern in ignore_patterns {
    let _ = override_builder.add(&format!("!{}", pattern));
  }
  let overrides = override_builder.build().unwrap_or(ignore::overrides::Override::empty());

  let walker = WalkBuilder::new(root)
    .standard_filters(true)
    .hidden(true)
    .overrides(overrides)
    .build();

  for entry in walker {
    if let Ok(entry) = entry {
      if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
        let path = entry.path();
        files.push(path.to_string_lossy().to_string());
      }
    }
  }

  files
}

#[napi]
pub fn parse_files_basic(files: Vec<String>) -> Vec<bool> {
  files.into_par_iter()
    .map(|file_path| {
      if let Ok(content) = fs::read_to_string(&file_path) {
        !content.is_empty()
      } else {
        false
      }
    })
    .collect()
}

#[napi]
pub fn count_tech_debt_native(files: Vec<String>) -> i32 {
  files.into_par_iter()
    .map(|file_path| {
      if let Ok(content) = fs::read_to_string(&file_path) {
        TECH_DEBT_RE.find_iter(&content).count() as i32
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
      if let Ok(content) = fs::read_to_string(&file_path) {
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
pub fn get_dependents_native(_target_file: String, import_map: HashMap<String, Vec<String>>) -> Vec<String> {
  let mut graph = DiGraph::<String, ()>::new();
  let mut nodes = HashMap::new();

  for file in import_map.keys() {
    let idx = graph.add_node(file.clone());
    nodes.insert(file.clone(), idx);
  }

  for (file, imports) in &import_map {
    if let Some(&from_idx) = nodes.get(file) {
      for import_path in imports {
        if let Some(&to_idx) = nodes.get(import_path) {
          graph.add_edge(from_idx, to_idx, ());
        }
      }
    }
  }

  let mut dependents = Vec::new();
  if let Some(&target_idx) = nodes.get(&_target_file) {
    let mut incoming = graph.neighbors_directed(target_idx, petgraph::Direction::Incoming);
    while let Some(neighbor_idx) = incoming.next() {
      if let Some(file_name) = graph.node_weight(neighbor_idx) {
        dependents.push(file_name.clone());
      }
    }
  }

  dependents
}

#[derive(Deserialize, Debug)]
struct TsConfig {
  #[serde(rename = "compilerOptions")]
  compiler_options: Option<CompilerOptions>,
}

#[derive(Deserialize, Debug)]
struct CompilerOptions {
  #[serde(rename = "baseUrl")]
  base_url: Option<String>,
  paths: Option<HashMap<String, Vec<String>>>,
}

#[napi(object)]
#[derive(Serialize, Default)]
pub struct TsConfigPaths {
  pub base_url: Option<String>,
  pub paths: HashMap<String, Vec<String>>,
}

#[napi]
pub fn parse_tsconfig_paths(config_path: String) -> Option<TsConfigPaths> {
  let content = fs::read_to_string(config_path).ok()?;
  let config: TsConfig = serde_json::from_str(&content).ok()?;
  
  if let Some(options) = config.compiler_options {
    return Some(TsConfigPaths {
      base_url: options.base_url,
      paths: options.paths.unwrap_or_default(),
    });
  }
  
  None
}

#[napi]
pub fn resolve_module_path_native(
  current_dir: String,
  source: String,
  workspace_path: String,
  base_url: Option<String>,
  paths: Option<HashMap<String, Vec<String>>>,
) -> Option<String> {
  let mut resolved_source = source.clone();
  if let Some(paths_map) = paths {
    for (alias, mappings) in paths_map {
      let alias_key = alias.replace("/*", "");
      if source.starts_with(&alias_key) {
        if let Some(mapping) = mappings.first() {
          let mapping_key = mapping.replace("/*", "");
          let relative_resolved = source.replace(&alias_key, &mapping_key);
          
          let base = if let Some(ref b) = base_url {
            Path::new(&workspace_path).join(b)
          } else {
            PathBuf::from(&workspace_path)
          };
          
          resolved_source = base.join(relative_resolved).to_string_lossy().to_string();
          break;
        }
      }
    }
  }

  let candidate_base = if Path::new(&resolved_source).is_absolute() {
    PathBuf::from(&resolved_source)
  } else {
    Path::new(&current_dir).join(&resolved_source)
  };

  let extensions = vec!["", ".ts", ".js", ".tsx", ".jsx", "/index.ts", "/index.js"];
  for ext in extensions {
    let mut candidate = candidate_base.clone();
    if !ext.is_empty() {
      if ext.starts_with('/') {
        candidate.push(&ext[1..]);
      } else {
        let mut s = candidate.to_string_lossy().to_string();
        s.push_str(ext);
        candidate = PathBuf::from(s);
      }
    }
    
    if candidate.exists() && candidate.is_file() {
      return Some(candidate.to_string_lossy().to_string());
    }
  }

  None
}

#[napi(object)]
pub struct SymbolResult {
  pub name: String,
  pub line: u32,
  pub end_line: u32,
  pub is_exported: bool,
  pub kind: String,
  pub complexity: i32,
  pub lines: i32,
}

fn extract_symbols_internal(file_path: &str) -> Vec<SymbolResult> {
  let mut symbols = Vec::new();
  if let Ok(content) = fs::read_to_string(file_path) {
    let re_func = Regex::new(r#"(?P<exp>export\s+)?(?P<async>async\s+)?function\s+(?P<name>[a-zA-Z0-9_$]+)"#).unwrap();
    let re_class = Regex::new(r#"(?P<exp>export\s+)?class\s+(?P<name>[a-zA-Z0-9_$]+)"#).unwrap();
    let re_const = Regex::new(r#"(?P<exp>export\s+)?(?:const|let|var)\s+(?P<name>[a-zA-Z0-9_$]+)"#).unwrap();
    let re_method = Regex::new(r#"\s*(?P<name>[a-zA-Z0-9_$]+)\s*\(.*?\)\s*(?::\s*[a-zA-Z0-9_$<>\[\]\s|&]+)?\s*\{"#).unwrap();

    let mut current_class: Option<String> = None;
    let mut class_brace_level: i32 = 0;
    let mut brace_count: i32 = 0;
    
    let lines: Vec<&str> = content.lines().collect();
    let mut in_symbol: Option<(usize, i32)> = None;

    for (i, line) in lines.iter().enumerate() {
      let trimmed = line.trim();
      let opened = trimmed.matches('{').count() as i32;
      let closed = trimmed.matches('}').count() as i32;
      
      let mut found_new_symbol = false;

      if brace_count == class_brace_level {
        if let Some(cap) = re_func.captures(line) {
          symbols.push(SymbolResult {
            name: cap.name("name").unwrap().as_str().to_string(),
            line: (i + 1) as u32,
            end_line: (i + 1) as u32,
            is_exported: cap.name("exp").is_some(),
            kind: "function".to_string(),
            complexity: 1,
            lines: 1,
          });
          in_symbol = Some((symbols.len() - 1, brace_count));
          found_new_symbol = true;
        } else if let Some(cap) = re_class.captures(line) {
          let class_name = cap.name("name").unwrap().as_str().to_string();
          current_class = Some(class_name.clone());
          class_brace_level = brace_count;
          symbols.push(SymbolResult {
            name: class_name,
            line: (i + 1) as u32,
            end_line: (i + 1) as u32,
            is_exported: cap.name("exp").is_some(),
            kind: "class".to_string(),
            complexity: 1,
            lines: 1,
          });
          found_new_symbol = true;
        } else if let Some(cap) = re_const.captures(line) {
          symbols.push(SymbolResult {
            name: cap.name("name").unwrap().as_str().to_string(),
            line: (i + 1) as u32,
            end_line: (i + 1) as u32,
            is_exported: cap.name("exp").is_some(),
            kind: "function".to_string(), 
            complexity: 1,
            lines: 1,
          });
          in_symbol = Some((symbols.len() - 1, brace_count));
          found_new_symbol = true;
        }
      } else if let Some(ref cls) = current_class {
        if brace_count == class_brace_level + 1 {
          if let Some(cap) = re_method.captures(line) {
            let m_name = cap.name("name").unwrap().as_str().to_string();
            if m_name != "constructor" && !vec!["if", "for", "while", "switch", "catch", "function"].contains(&m_name.as_str()) {
              symbols.push(SymbolResult {
                name: format!("{}.{}", cls, m_name),
                line: (i + 1) as u32,
                end_line: (i + 1) as u32,
                is_exported: false,
                kind: "method".to_string(),
                complexity: 1,
                lines: 1,
              });
              in_symbol = Some((symbols.len() - 1, brace_count));
              found_new_symbol = true;
            }
          }
        }
      }

      if let Some((idx, level)) = in_symbol {
        let line_complexity = COMPLEXITY_RE.find_iter(line).count() as i32;
        if found_new_symbol {
           symbols[idx].complexity += line_complexity;
        } else if brace_count > level || (brace_count == level && opened == 0) {
          symbols[idx].complexity += line_complexity;
          symbols[idx].lines += 1;
          symbols[idx].end_line = (i + 1) as u32;
        }
      }

      brace_count += opened;
      brace_count -= closed;
      
      if let Some((_, level)) = in_symbol {
        if brace_count <= level && closed > 0 {
          in_symbol = None;
        }
      }

      if let Some(_) = current_class {
        if brace_count <= class_brace_level && closed > 0 {
          current_class = None;
        }
      }
    }
  }
  symbols
}

#[napi]
pub fn extract_symbols_native(file_path: String) -> Vec<SymbolResult> {
  extract_symbols_internal(&file_path)
}

#[napi(object)]
pub struct ReferenceResult {
  pub file: String,
  pub line: u32,
}

#[napi]
pub fn find_references_native(symbol_name: String, files: Vec<String>) -> Vec<ReferenceResult> {
  let pattern = format!(r"\b{}\b", regex::escape(&symbol_name));
  let re = Regex::new(&pattern).unwrap();
  
  let def_pattern = format!(r#"(?:function|class|const|let|var)\s+\b{}\b"#, regex::escape(&symbol_name));
  let re_def = Regex::new(&def_pattern).unwrap();

  files.into_par_iter()
    .flat_map(|file_path| {
      let mut file_refs = Vec::new();
      if let Ok(content) = fs::read_to_string(&file_path) {
        let lines: Vec<&str> = content.lines().collect();
        for (i, line) in lines.iter().enumerate() {
          if re.is_match(line) {
            if re_def.is_match(line) && !line.contains("import ") {
               continue;
            }
            file_refs.push(ReferenceResult {
              file: file_path.clone(),
              line: (i + 1) as u32,
            });
          }
        }
      }
      file_refs
    })
    .collect()
}

#[napi(object)]
pub struct FileMetrics {
  pub complexity: i32,
  pub lines: i32,
}

#[napi]
pub fn get_file_metrics_native(file_path: String) -> Option<FileMetrics> {
  if let Ok(content) = fs::read_to_string(&file_path) {
    let re_words = Regex::new(r"\b(if|for|while|switch|catch)\b").unwrap();
    let re_ops = Regex::new(r"(&&|\|\|)").unwrap();
    
    let complexity = re_words.find_iter(&content).count() as i32 
                   + re_ops.find_iter(&content).count() as i32 
                   + 1;
    let lines = content.lines().count() as i32;
    
    return Some(FileMetrics {
      complexity,
      lines,
    });
  }
  None
}

#[napi]
pub fn detect_cycles_native(import_map: HashMap<String, Vec<String>>) -> Vec<Vec<String>> {
  let mut graph = DiGraph::<String, ()>::new();
  let mut nodes = HashMap::new();

  for file in import_map.keys() {
    let idx = graph.add_node(file.clone());
    nodes.insert(file.clone(), idx);
  }

  for (file, imports) in &import_map {
    if let Some(&from_idx) = nodes.get(file) {
      for import_path in imports {
        if let Some(&to_idx) = nodes.get(import_path) {
          graph.add_edge(from_idx, to_idx, ());
        }
      }
    }
  }

  let sccs = tarjan_scc(&graph);
  
  sccs.into_iter()
    .filter(|scc| {
      if scc.len() > 1 {
        true
      } else if scc.len() == 1 {
        let node_idx = scc[0];
        graph.contains_edge(node_idx, node_idx)
      } else {
        false
      }
    })
    .map(|scc| {
      scc.into_iter()
        .map(|idx| graph.node_weight(idx).unwrap().clone())
        .collect()
    })
    .collect()
}

#[napi(object)]
pub struct HallucinationViolation {
  pub name: String,
  pub line: u32,
}

#[napi]
pub fn verify_hallucination_native(
  file_path: String,
  local_defs: Vec<String>,
  imports: Vec<String>,
  builtins: Vec<String>,
  external_exports: Vec<String>,
) -> Vec<HallucinationViolation> {
  let mut violations = Vec::new();
  
  let mut allowed = HashSet::new();
  for s in local_defs { allowed.insert(s); }
  for s in imports { allowed.insert(s); }
  for s in builtins { allowed.insert(s); }
  for s in external_exports { allowed.insert(s); }

  if let Ok(content) = fs::read_to_string(&file_path) {
    let re_def = Regex::new(r#"(?:function|class|const|let|var)\s+\b(?P<name>[a-zA-Z0-9_$]+)\b"#).unwrap();
    let re_call = Regex::new(r#"(?P<prefix>[\.\?])?\b(?P<name>[a-zA-Z0-9_$]+)\b\s*\("#).unwrap();
    
    let lines: Vec<&str> = content.lines().collect();
    for (i, line) in lines.iter().enumerate() {
      if line.trim().starts_with("//") || line.trim().starts_with("*") {
        continue;
      }

      let def_names: HashSet<&str> = re_def.captures_iter(line)
        .map(|cap| cap.name("name").unwrap().as_str())
        .collect();

      for cap in re_call.captures_iter(line) {
        let prefix = cap.name("prefix").map(|m| m.as_str());
        let name = cap.name("name").unwrap().as_str();
        
        if prefix.is_some() {
          continue;
        }

        if vec!["if", "for", "while", "switch", "catch", "super", "import", "require", "return", "await", "yield"].contains(&name) {
          continue;
        }

        if def_names.contains(name) {
          continue;
        }

        if !allowed.contains(name) {
          violations.push(HallucinationViolation {
            name: name.to_string(),
            line: (i + 1) as u32,
          });
        }
      }
    }
  }

  violations
}

#[napi]
pub fn has_korean_comment_native(file_path: String, line: u32, search_depth: u32) -> bool {
  if let Ok(content) = fs::read_to_string(&file_path) {
    let lines: Vec<&str> = content.lines().collect();
    let start_line = if line > search_depth { line - search_depth } else { 1 };
    let end_line = line;

    let re_korean = Regex::new(r"[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]").unwrap();
    let re_comment = Regex::new(r"//|/\*|\*").unwrap();

    for i in (start_line..end_line).rev() {
      let idx = (i - 1) as usize;
      if idx < lines.len() {
        let l = lines[idx];
        if re_comment.is_match(l) && re_korean.is_match(l) {
          return true;
        }
      }
    }
  }
  false
}

#[napi]
pub fn check_fake_logic_native(body: String, params: Vec<String>) -> Vec<String> {
  let re_comments = Regex::new(r"(?m)//.*|/\*[\s\S]*?\*/").unwrap();
  let clean_body = re_comments.replace_all(&body, "");

  let mut unused = Vec::new();
  for p in params {
    let pattern = format!(r"\b{}\b", regex::escape(&p));
    let re = Regex::new(&pattern).unwrap();
    
    if re.find_iter(&clean_body).count() == 0 {
      unused.push(p);
    }
  }
  unused
}

#[napi(object)]
pub struct FileCoverageResult {
  pub file: String,
  pub total: i32,
  pub hit: i32,
}

#[napi(object)]
pub struct LcovResult {
  pub total: i32,
  pub hit: i32,
  pub files: Vec<FileCoverageResult>,
}

#[napi]
pub fn parse_lcov_native(path: String, all_files: Vec<String>) -> Option<LcovResult> {
  if let Ok(content) = fs::read_to_string(&path) {
    let mut files = Vec::new();
    let mut total_lines = 0;
    let mut hit_lines = 0;
    
    let mut current_file = String::new();
    let mut current_lf = 0;
    let mut current_lh = 0;

    for line in content.lines() {
      if line.starts_with("SF:") {
        current_file = line[3..].trim().to_string();
        current_lf = 0;
        current_lh = 0;
      } else if line.starts_with("LF:") {
        if let Ok(val) = line[3..].trim().parse::<i32>() {
          current_lf = val;
        }
      } else if line.starts_with("LH:") {
        if let Ok(val) = line[3..].trim().parse::<i32>() {
          current_lh = val;
        }
      } else if line == "end_of_record" {
        let matched_file = if current_file.is_empty() {
           "unknown".to_string()
        } else {
           all_files.iter()
            .find(|f| f.ends_with(&current_file) || current_file.ends_with(*f))
            .cloned()
            .unwrap_or(current_file.clone())
        };

        files.push(FileCoverageResult {
          file: matched_file,
          total: current_lf,
          hit: current_lh,
        });
        total_lines += current_lf;
        hit_lines += current_lh;
      }
    }

    if total_lines == 0 {
       for line in content.lines() {
          if line.starts_with("LF:") {
            if let Ok(val) = line[3..].trim().parse::<i32>() { total_lines += val; }
          } else if line.starts_with("LH:") {
            if let Ok(val) = line[3..].trim().parse::<i32>() { hit_lines += val; }
          }
       }
    }

    return Some(LcovResult {
      total: total_lines,
      hit: hit_lines,
      files,
    });
  }
  None
}

#[napi(object)]
pub struct SecretViolation {
  pub file: String,
  pub line: u32,
  pub message: String,
  pub rationale: String,
}

#[napi]
pub fn scan_secrets_native(files: Vec<String>) -> Vec<SecretViolation> {
  files.into_par_iter()
    .flat_map(|file_path| {
      let mut file_violations = Vec::new();
      if let Ok(content) = fs::read_to_string(&file_path) {
        let lines: Vec<&str> = content.lines().collect();
        for (i, line) in lines.iter().enumerate() {
          for (id, re, msg) in SECRET_PATTERNS.iter() {
            if re.is_match(line) {
              file_violations.push(SecretViolation {
                file: file_path.clone(),
                line: (i + 1) as u32,
                message: msg.to_string(),
                rationale: format!("패턴 일치: {}", id),
              });
            }
          }
        }
      }
      file_violations
    })
    .collect()
}

#[napi(object)]
pub struct BatchResult {
  pub file: String,
  pub line_count: i32,
  pub complexity: i32,
  pub symbols: Vec<SymbolResult>,
  pub secrets: Vec<SecretViolation>,
}

#[napi]
pub fn run_batch_analysis_native(files: Vec<String>) -> Vec<BatchResult> {
  files.into_par_iter()
    .map(|file_path| {
      let symbols = extract_symbols_internal(&file_path);
      let mut secrets = Vec::new();
      let mut line_count = 0;
      let mut overall_complexity = 1;

      if let Ok(content) = fs::read_to_string(&file_path) {
        line_count = content.lines().count() as i32;
        overall_complexity = COMPLEXITY_RE.find_iter(&content).count() as i32 + 1;

        let lines: Vec<&str> = content.lines().collect();
        for (i, line) in lines.iter().enumerate() {
          for (id, re, msg) in SECRET_PATTERNS.iter() {
            if re.is_match(line) {
              secrets.push(SecretViolation {
                file: file_path.clone(),
                line: (i + 1) as u32,
                message: msg.to_string(),
                rationale: format!("패턴 일치: {}", id),
              });
            }
          }
        }
      }
      BatchResult {
        file: file_path,
        line_count,
        complexity: overall_complexity,
        symbols,
        secrets,
      }
    })
    .collect()
}
