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
pub static COMPLEXITY_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(if|for|while|switch|catch|case|default)\b|(\?|\.map\(|\.filter\(|\.reduce\()").unwrap());

static BUILTINS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    let mut s = HashSet::new();
    let names = vec![
        "console", "Math", "JSON", "Promise", "process", "Object", "Array", "String", "Number", "Boolean",
        "Date", "RegExp", "Error", "Map", "Set", "WeakMap", "Uint8Array", "Intl", "BigInt", "Symbol", "Reflect", "Proxy",
        "setTimeout", "setInterval", "setImmediate", "clearTimeout", "clearInterval",
        "clearImmediate", "require", "module", "exports", "global", "window", "document", "navigator", "location",
        "history", "screen", "__dirname", "__filename", "Buffer", "encodeURI", "encodeURIComponent", "decodeURI",
        "decodeURIComponent", "parseFloat", "parseInt", "isNaN", "isFinite", "fetch", "Headers", "Request",
        "Response", "URL", "URLSearchParams", "AbortController", "AbortSignal", "FormData", "Blob", "File",
        "FileReader", "WebSocket", "Event", "CustomEvent", "MessageChannel", "MessagePort", "Worker",
        "Float32Array", "Float64Array", "Int8Array", "Int16Array", "Int32Array", "Uint8Array", "Uint8ClampedArray", "Uint16Array", "Uint32Array", "BigInt64Array", "BigUint64Array",
        // Node.js Builtins (Common Methods)
        "fs", "readFileSync", "writeFileSync", "existsSync", "mkdirSync", "rmSync", "readdirSync", "statSync", "renameSync", "appendFileSync",
        "path", "join", "resolve", "dirname", "basename", "extname", "relative", "normalize", "isAbsolute",
        "os", "homedir", "arch", "platform", "cpus", "totalmem", "freemem", "networkInterfaces",
        "crypto", "createHash", "createHmac", "randomBytes", "createCipheriv", "createDecipheriv",
        "child_process", "exec", "execSync", "spawn", "spawnSync", "fork",
        "util", "promisify", "inherits", "format", "inspect",
        // Test Frameworks (Jest, Vitest, Mocha)
        "describe", "it", "test", "expect", "beforeEach", "afterEach", "beforeAll", "afterAll", "vi", "jest", "assert", "chai",
    ];
    for name in names { s.insert(name); }
    s
});

static NOISE_SYMBOLS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    let mut s = HashSet::new();
    let names = vec!["game", "app", "core", "main", "root", "item", "data", "info", "ctx"];
    for name in names { s.insert(name); }
    s
});

mod parser;
mod parser_rust;
mod cache;
mod resolver;

// ... (기존 Lazy static들)

#[napi]
pub fn clear_path_cache_native() {
  resolver::clear_path_cache_native()
}

#[napi]
pub fn find_nearest_project_root_native(current_dir: String) -> String {
  resolver::find_nearest_project_root_native(current_dir)
}

#[napi]
pub fn load_project_aliases_native(workspace_path: String) -> HashMap<String, String> {
  resolver::load_project_aliases_native(workspace_path)
}

#[napi]
pub fn resolve_module_path_native_v2(
  current_dir: String,
  import_path: String,
  all_files: Vec<String>,
  file_path: Option<String>,
) -> Option<String> {
  resolver::resolve_module_path_native_v2(current_dir, import_path, all_files, file_path)
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
#[derive(Clone, Serialize)]
pub struct SymbolResult {
  pub name: String,
  pub line: u32,
  pub end_line: u32,
  pub is_exported: bool,
  pub kind: String,
  pub complexity: i32,
  pub lines: i32,
  pub parameter_count: i32,
  pub has_korean_comment: bool,
  pub local_identifiers: Vec<String>, // 함수/클래스 내부의 로컬 변수 및 파라미터 이름
}

#[napi]
pub fn extract_symbols_native(file_path: String) -> Vec<SymbolResult> {
  let content = fs::read_to_string(&file_path).unwrap_or_default();
  parser::extract_symbols_oxc(&content, &file_path)
}

#[napi]
pub fn extract_symbols_rust_native(file_path: String, content: String) -> Vec<SymbolResult> {
  parser_rust::extract_symbols_syn(&content, &file_path)
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
  let content = fs::read_to_string(&file_path).unwrap_or_default();
  
  let mut global_allowed = HashSet::new();
  for s in local_defs { global_allowed.insert(s); }
  for s in imports { 
      global_allowed.insert(s.clone());
      if s.starts_with("node:") {
          global_allowed.insert(s.replace("node:", ""));
      }
  }
  for s in builtins { global_allowed.insert(s); }
  for s in external_exports { global_allowed.insert(s); }
  for s in BUILTINS.iter() { global_allowed.insert(s.to_string()); }

  let symbols = parser::extract_symbols_oxc(&content, &file_path);
  for s in &symbols { 
      global_allowed.insert(s.name.clone()); 
      if let Some(pos) = s.name.find('.') {
          global_allowed.insert(s.name[pos+1..].to_string());
      }
  }

  // 1. 전처리: 주석, 문자열, 정규식 리터럴, JSX 태그를 제거하되 라인 번호 보존을 위해 \n은 남김
  let re_noise = Regex::new(r#"(?m)//.*|/\*[\s\S]*?\*/|'[^']*'|"[^"]*"|`[^`]*`|/[^/\n]+/[gimuy]*|<[^>]+>"#).unwrap();
  let clean_content = re_noise.replace_all(&content, |caps: &regex::Captures| {
      let mut res = String::new();
      for c in caps[0].chars() {
          if c == '\n' { res.push('\n'); }
          else { res.push(' '); }
      }
      res
  }).to_string();

  let re_call = Regex::new(r#"(?P<prefix>[\.\?])?\b(?P<name>[a-zA-Z0-9_$]+)\b\s*\("#).unwrap();
  let skip_keywords = vec![
      "if", "for", "while", "switch", "catch", "super", "import", "require", 
      "return", "await", "yield", "constructor", "async", "get", "set", "new", "fixLogic",
      "interface", "type", "declare", "enum", "readonly", "static", "public", "private", "protected", "as", "is",
      "typeof", "instanceof"
  ];

  for (i, line) in clean_content.lines().enumerate() {
      if line.trim().is_empty() { continue; }
      let line_num = (i + 1) as u32;
      
      // 현재 라인이 속한 심볼(함수/메서드)의 로컬 식별자들을 수집
      let mut current_local_allowed = HashSet::new();
      for s in &symbols {
          if line_num >= s.line && line_num <= s.end_line {
              for id in &s.local_identifiers {
                  current_local_allowed.insert(id.clone());
              }
          }
      }
      
      for cap in re_call.captures_iter(line) {
          let prefix = cap.name("prefix").map(|m| m.as_str());
          let name = cap.name("name").unwrap().as_str();
          
          if prefix.is_some() { continue; }
          if skip_keywords.contains(&name) { continue; }
          
          // v3.8.3: React Hook Setter (setSomething) 자동 허용
          let is_hook_setter = name.starts_with("set") && name.len() > 3 && name.chars().nth(3).unwrap_or(' ').is_uppercase();
          
          if !global_allowed.contains(name) && !current_local_allowed.contains(name) && !is_hook_setter {
              violations.push(HallucinationViolation {
                  name: name.to_string(),
                  line: line_num,
              });
          }
      }
  }

  violations
}

#[napi]
pub fn has_korean_comment_native(file_path: String, line: u32, search_depth: u32) -> bool {
  if let Ok(content) = fs::read_to_string(&file_path) {
    let lines: Vec<&str> = content.lines().collect();
    parser::has_korean_comment_above(&lines, line as usize, search_depth as usize)
  } else {
    false
  }
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
pub struct BatchResult {
  pub file: String,
  pub line_count: i32,
  pub complexity: i32,
  pub symbols: Vec<SymbolResult>,
}

#[napi]
pub fn run_batch_analysis_native(files: Vec<String>) -> Vec<BatchResult> {
  files.into_par_iter()
    .map(|file_path| {
      let content_str = fs::read_to_string(&file_path).unwrap_or_default();
      let symbols = parser::extract_symbols_oxc(&content_str, &file_path);
      let mut line_count = 0;
      let mut overall_complexity = 1;

      if let Ok(content) = fs::read_to_string(&file_path) {
        line_count = content.lines().count() as i32;
        overall_complexity = COMPLEXITY_RE.find_iter(&content).count() as i32 + 1;
      }
      BatchResult {
        file: file_path,
        line_count,
        complexity: overall_complexity,
        symbols,
      }
    })
    .collect()
}

#[napi(object)]
#[derive(Clone)]
pub struct ReviewOptions {
  pub max_function_lines: i32,
  pub max_parameter_count: i32,
  pub density_threshold_medium: i32,
  pub density_threshold_high: i32,
  pub min_function_lines_for_comment: i32,
}

#[napi(object)]
pub struct Violation {
  pub r#type: String,
  pub file: Option<String>,
  pub line: Option<u32>,
  pub rationale: Option<String>,
  pub message: String,
}

#[napi]
pub fn run_semantic_review_native(
  file_path: String,
  is_test_file: bool,
  options: ReviewOptions,
) -> Vec<Violation> {
  let mut violations = Vec::new();
  let content = fs::read_to_string(&file_path).unwrap_or_default();
  let symbols = parser::extract_symbols_oxc(&content, &file_path);
  let is_dto_or_entity = file_path.to_lowercase().contains("dto") || file_path.to_lowercase().contains("entity");

  for s in symbols {
      let is_noise = NOISE_SYMBOLS.contains(s.name.as_str()) || s.name.len() <= 2;
      if is_noise && s.lines < 10 { continue; }
      if s.name == "anonymous" { continue; }

      let start_line = s.line;

      if !is_test_file && (s.kind == "class" || s.kind == "function") {
          if !s.has_korean_comment {
              let label = if s.kind == "class" { "클래스" } else { "함수" };
              violations.push(Violation {
                  r#type: "READABILITY".to_string(),
                  file: Some(file_path.clone()),
                  line: Some(start_line),
                  rationale: Some(format!("심볼 타입: {} [{}]", s.kind, s.name)),
                  message: format!("[Senior Advice] {} [{}]에 한글 주석이 없습니다. 한글 주석을 추가하세요.", label, s.name),
              });
          }
      }

      if is_test_file && (s.kind == "suite" || s.kind == "test_logic") {
          if !s.has_korean_comment {
              let label = if s.kind == "suite" { "테스트 스위트(Suite)" } else { "테스트 설정 로직(Setup)" };
              violations.push(Violation {
                  r#type: "READABILITY".to_string(),
                  file: Some(file_path.clone()),
                  line: Some(start_line),
                  rationale: Some(format!("심볼 타입: {}", label)),
                  message: format!("[Senior Advice] 복잡한 {} [{}] 구간의 의도(Intent)나 Mocking 구조를 설명하는 한글 주석을 추가하세요.", label, s.name),
              });
          }
      }

      if is_test_file { continue; }

      if s.kind == "function" || s.kind == "method" {
          if s.lines > options.max_function_lines {
              violations.push(Violation {
                  r#type: "READABILITY".to_string(),
                  file: Some(file_path.clone()),
                  line: Some(start_line),
                  rationale: Some(format!("함수 길이: {}줄 (제한: {}줄)", s.lines, options.max_function_lines)),
                  message: format!("[Senior Advice] 함수 [{}]의 길이가 너무 깁니다 ({}줄). 분할을 권장합니다.", s.name, s.lines),
              });
          }

          if s.parameter_count > options.max_parameter_count {
              violations.push(Violation {
                  r#type: "READABILITY".to_string(),
                  file: Some(file_path.clone()),
                  line: Some(start_line),
                  rationale: Some(format!("파라미터 개수 > {}", options.max_parameter_count)),
                  message: format!("[Senior Advice] 파라미터가 너무 많습니다 ({}개 초과). 객체로 묶으세요.", options.max_parameter_count),
              });
          }
          
          if s.lines >= 50 && !s.has_korean_comment {
               violations.push(Violation {
                  r#type: "READABILITY".to_string(),
                  file: Some(file_path.clone()),
                  line: Some(start_line),
                  rationale: Some(format!("함수 길이: {}줄, 주석 0개", s.lines)),
                  message: format!("[Senior Advice] 함수 [{}]의 로직이 복잡하지만 주석이 없습니다. 한글 주석을 추가하세요.", s.name),
              });
          }
      }

      if !is_test_file && (s.kind == "method" || s.kind == "field") {
          if !s.has_korean_comment {
              let mut label = if s.kind == "method" { "메서드" } else { "멤버 변수" };
              if s.kind == "field" && is_dto_or_entity {
                  label = "필드 (DTO/Entity)";
              }
              let display_name = s.name.split('.').last().unwrap_or(&s.name);
              violations.push(Violation {
                  r#type: "READABILITY".to_string(),
                  file: Some(file_path.clone()),
                  line: Some(start_line),
                  rationale: Some(format!("심볼 타입: {} [{}]", s.kind, s.name)),
                  message: format!("[Senior Advice] {} [{}] 위에 한글 주석을 추가하세요.", label, display_name),
              });
          }
      }

      if !is_test_file && s.kind == "assignment" {
          if !s.has_korean_comment {
              violations.push(Violation {
                  r#type: "READABILITY".to_string(),
                  file: Some(file_path.clone()),
                  line: Some(start_line),
                  rationale: Some("심볼 타입: 모듈 할당".to_string()),
                  message: format!("[Senior Advice] 모듈 할당 [{}] 위에 한글 주석을 추가하세요.", s.name),
              });
          }
      }
      
      if !is_test_file && s.kind == "variable" && !s.has_korean_comment {
          violations.push(Violation {
              r#type: "READABILITY".to_string(),
              file: Some(file_path.clone()),
              line: Some(start_line),
              rationale: Some("심볼 타입: 전역 변수".to_string()),
              message: format!("[Senior Advice] 전역 변수 [{}] 위에 한글 주석을 추가하세요.", s.name),
          });
      }
  }

  let deep_lines = parser::detect_deep_nesting_oxc(&content, &file_path);
  for line in deep_lines {
      violations.push(Violation {
          r#type: "READABILITY".to_string(),
          file: Some(file_path.clone()),
          line: Some(line),
          rationale: None,
          message: "[Senior Advice] 코드 중첩이 너무 깊습니다. 조기 리턴을 활용하세요.".to_string(),
      });
  }

  violations
}

#[napi]
pub fn run_mutation_test_native(file_path: String, test_command: String) -> Vec<Violation> {
    let mut violations = Vec::new();
    let original_content = fs::read_to_string(&file_path).unwrap_or_default();
    let mutants = parser::generate_mutations_oxc(&original_content, &file_path);

    for mutant in mutants {
        if let Err(_) = fs::write(&file_path, &mutant.content) {
            continue;
        }

        let status = std::process::Command::new("sh")
            .arg("-c")
            .arg(&test_command)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        let success = status.map(|s| s.success()).unwrap_or(false);

        if success {
            violations.push(Violation {
                r#type: "MUTATION_SURVIVED".to_string(),
                file: Some(file_path.clone()),
                line: Some(mutant.line),
                rationale: Some(format!("변이: '{}' -> '{}'", mutant.original, mutant.mutation)),
                message: format!("변이 테스트 실패: '{}'를 '{}'로 바꿨는데도 테스트가 통과함.", mutant.original, mutant.mutation),
            });
            let _ = fs::write(&file_path, &original_content);
            break;
        }
    }

    let _ = fs::write(&file_path, &original_content);
    violations
}

#[napi(object)]
pub struct UltimateAnalysisResult {
    pub file: String,
    pub line_count: i32,
    pub complexity: i32,
    pub violations: Vec<Violation>,
    pub symbols: Vec<SymbolResult>,
}

#[napi]
pub fn run_ultimate_analysis_native(
    file_path: String,
    is_test_file: bool,
    review_options: ReviewOptions,
    external_exports: Vec<String>,
    imports: Vec<String>,
) -> UltimateAnalysisResult {
    let content = fs::read_to_string(&file_path).unwrap_or_default();
    let symbols = parser::extract_symbols_oxc(&content, &file_path);
    
    let line_count = content.lines().count() as i32;
    let complexity = COMPLEXITY_RE.find_iter(&content).count() as i32 + 1;
    
    let mut violations = Vec::new();
    
    violations.extend(run_semantic_review_native(file_path.clone(), is_test_file, review_options.clone()));
    
    violations.extend(verify_hallucination_native(
        file_path.clone(),
        Vec::new(),
        imports,
        Vec::new(),
        external_exports,
    ).into_iter().map(|h| Violation {
        r#type: "HALLUCINATION".to_string(),
        file: Some(file_path.clone()),
        line: Some(h.line),
        rationale: Some(format!("심볼 [{}]이 존재하지 않음", h.name)),
        message: format!("[AI Hallucination] 존재하지 않는 API 호출: {}", h.name),
    }));
    
    if complexity >= 10 {
        let mut blueprint = String::from("\n\n[Refactoring Blueprint]\n");
        let mut sorted_symbols = symbols.clone();
        sorted_symbols.sort_by(|a, b| b.complexity.cmp(&a.complexity));
        for s in sorted_symbols.iter().take(3) {
            let ratio = if complexity > 0 { (s.complexity * 100) / complexity } else { 0 };
            blueprint.push_str(&format!("- [{}] {} (Complexity: {} [{}%], L{}-L{})\n", s.kind, s.name, s.complexity, ratio, s.line, s.end_line));
        }
        violations.push(Violation {
            r#type: "COMPLEXITY".to_string(),
            file: Some(file_path.clone()),
            line: Some(1),
            rationale: Some(format!("복잡도: {} (임계값: {})", complexity, 10)),
            message: format!("전체 복잡도({})가 기준을 초과했습니다. {}", complexity, blueprint),
        });
    }

    UltimateAnalysisResult {
        file: file_path,
        line_count,
        complexity,
        violations,
        symbols,
    }
}

#[napi(object)]
pub struct SelfHealingResult {
    pub fixed_count: i32,
    pub content: String,
}

#[napi]
pub fn run_self_healing_native(file_path: String) -> SelfHealingResult {
    let content = fs::read_to_string(&file_path).unwrap_or_default();
    let (fixed_content, fix_count) = parser::fix_readability_oxc(&content, &file_path);
    
    if fix_count > 0 {
        let _ = fs::write(&file_path, &fixed_content);
    }

    SelfHealingResult {
        fixed_count: fix_count,
        content: fixed_content,
    }
}

#[napi(object)]
#[derive(Clone, Deserialize)]
pub struct ArchitectureRule {
  pub from: String,
  pub to: String,
  pub message: String,
}

#[napi]
pub fn check_architecture_native(
  file_path: String,
  rules: Vec<ArchitectureRule>,
  workspace_path: String,
) -> Vec<Violation> {
  let mut violations = Vec::new();
  let absolute_path = if Path::new(&file_path).is_absolute() {
    PathBuf::from(&file_path)
  } else {
    Path::new(&workspace_path).join(&file_path)
  };
  
  let relative_file_path = match absolute_path.strip_prefix(&workspace_path) {
    Ok(p) => p.to_string_lossy().to_string(),
    Err(_) => return violations,
  };

  let active_rules: Vec<ArchitectureRule> = rules.into_iter()
    .filter(|r| {
      let pattern = r.from.replace("**/", ".*").replace("*", "[^/]*");
      let re = Regex::new(&format!("^{}$", pattern)).unwrap_or_else(|_| Regex::new(".*").unwrap());
      re.is_match(&relative_file_path)
    })
    .collect();

  if active_rules.is_empty() {
    return violations;
  }

  if let Ok(content) = fs::read_to_string(&absolute_path) {
    let re_import = Regex::new(r#"(?:import|export)\s+.*?\s+from\s+['"](.*?)['"]|import\(['"](.*?)['"]\)"#).unwrap();
    let lines: Vec<&str> = content.lines().collect();

    for (i, line_text) in lines.iter().enumerate() {
      for cap in re_import.captures_iter(line_text) {
        if let Some(m) = cap.get(1).or(cap.get(2)) {
          let source = m.as_str();
          if source.starts_with('.') {
            let parent = absolute_path.parent().unwrap_or(Path::new(""));
            let resolved = parent.join(source);
            
            // Simple path normalization
            let mut components = Vec::new();
            for component in resolved.components() {
                match component {
                    std::path::Component::ParentDir => { components.pop(); }
                    std::path::Component::CurDir => {}
                    std::path::Component::Normal(c) => { components.push(c); }
                    std::path::Component::RootDir => { components.clear(); components.push(std::ffi::OsStr::new("/")); }
                    _ => {}
                }
            }
            let normalized_resolved: PathBuf = components.iter().collect();

            let rel_resolved = match normalized_resolved.strip_prefix(&workspace_path) {
               Ok(p) => p.to_string_lossy().to_string(),
               Err(_) => {
                  let ws_path = Path::new(&workspace_path);
                  if normalized_resolved.starts_with(ws_path) {
                      normalized_resolved.strip_prefix(ws_path).unwrap().to_string_lossy().to_string()
                  } else {
                      continue;
                  }
               }
            };

            for rule in &active_rules {
              let to_pattern = rule.to.replace("**/", ".*").replace("*", "[^/]*");
              let re_to = Regex::new(&format!("^{}$", to_pattern)).unwrap_or_else(|_| Regex::new(".*").unwrap());
              if re_to.is_match(&rel_resolved) {
                violations.push(Violation {
                  r#type: "ARCHITECTURE_VIOLATION".to_string(),
                  file: Some(file_path.clone()),
                  line: Some((i + 1) as u32),
                  rationale: None,
                  message: rule.message.clone(),
                });
              }
            }
          }
        }
      }
    }
  }

  violations
}
