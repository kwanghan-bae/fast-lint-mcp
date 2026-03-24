use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::fs;
use serde::Deserialize;
use once_cell::sync::Lazy;
use std::sync::RwLock;

// 전역 캐시: 프로젝트 루트 및 별칭 정보 보관
static ROOT_CACHE: Lazy<RwLock<HashMap<String, String>>> = Lazy::new(|| RwLock::new(HashMap::new()));
static ALIAS_CACHE: Lazy<RwLock<HashMap<String, HashMap<String, String>>>> = Lazy::new(|| RwLock::new(HashMap::new()));

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

#[derive(Deserialize, Debug)]
struct PackageJson {
    imports: Option<serde_json::Value>,
}

pub fn clear_path_cache_native() {
    let mut root_cache = ROOT_CACHE.write().unwrap();
    root_cache.clear();
    let mut alias_cache = ALIAS_CACHE.write().unwrap();
    alias_cache.clear();
}

pub fn find_nearest_project_root_native(current_dir: String) -> String {
    {
        let cache = ROOT_CACHE.read().unwrap();
        if let Some(root) = cache.get(&current_dir) {
            return root.clone();
        }
    }

    let mut path_stack = Vec::new();
    let mut dir = PathBuf::from(&current_dir);
    let mut result = String::new();

    loop {
        path_stack.push(dir.to_string_lossy().to_string());
        if dir.join("tsconfig.json").exists() || dir.join("package.json").exists() {
            result = dir.to_string_lossy().to_string();
            break;
        }
        if let Some(parent) = dir.parent() {
            if dir == parent { break; }
            dir = parent.to_path_buf();
        } else {
            break;
        }
    }

    if result.is_empty() {
        result = std::env::current_dir().unwrap_or_default().to_string_lossy().to_string();
    }

    let mut cache = ROOT_CACHE.write().unwrap();
    for p in path_stack {
        cache.insert(p, result.clone());
    }
    cache.insert(current_dir, result.clone());
    
    result
}

pub fn load_project_aliases_native(workspace_path: String) -> HashMap<String, String> {
    {
        let cache = ALIAS_CACHE.read().unwrap();
        if let Some(aliases) = cache.get(&workspace_path) {
            return aliases.clone();
        }
    }

    let mut aliases = HashMap::new();
    let tsconfig_path = Path::new(&workspace_path).join("tsconfig.json");
    if let Ok(content) = fs::read_to_string(&tsconfig_path) {
        // 간단한 주석 제거
        let clean_content = content.lines()
            .filter(|l| !l.trim().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");
        
        if let Ok(config) = serde_json::from_str::<TsConfig>(&clean_content) {
            if let Some(options) = config.compiler_options {
                if let Some(paths) = options.paths {
                    for (key, values) in paths {
                        let clean_key = key.replace("/*", "");
                        let clean_key = if clean_key.ends_with('/') && clean_key.len() > 1 {
                             clean_key[..clean_key.len()-1].to_string()
                        } else {
                             clean_key
                        };

                        if let Some(target) = values.first() {
                            let clean_target = target.replace("/*", "");
                            let clean_target = if clean_target.ends_with('/') && clean_target.len() > 1 {
                                clean_target[..clean_target.len()-1].to_string()
                            } else {
                                clean_target
                            };
                            aliases.insert(clean_key, clean_target);
                        }
                    }
                }
            }
        }
    }

    let pkg_path = Path::new(&workspace_path).join("package.json");
    if let Ok(content) = fs::read_to_string(&pkg_path) {
        if let Ok(pkg_val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(imports) = pkg_val.get("imports") {
                if let Some(obj) = imports.as_object() {
                    for (key, val) in obj {
                        if let Some(s) = val.as_str() {
                            aliases.insert(key.clone(), s.to_string());
                        } else if let Some(inner_obj) = val.as_object() {
                            // default 등 중첩된 경우 처리
                            if let Some(default_val) = inner_obj.get("default").and_then(|v| v.as_str()) {
                                aliases.insert(key.clone(), default_val.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    let mut cache = ALIAS_CACHE.write().unwrap();
    cache.insert(workspace_path, aliases.clone());
    aliases
}

pub fn resolve_module_path_native_v2(
    current_dir: String,
    import_path: String,
    all_files: Vec<String>,
    file_path: Option<String>,
) -> Option<String> {
    let project_root = if let Some(ref fp) = file_path {
        let p = Path::new(fp);
        let parent = p.parent().unwrap_or(Path::new(".")).to_string_lossy().to_string();
        find_nearest_project_root_native(parent)
    } else {
        find_nearest_project_root_native(current_dir.clone())
    };

    let aliases = load_project_aliases_native(project_root.clone());
    let mut resolved_import_path = import_path.clone();

    for (alias, target) in &aliases {
        if import_path == *alias || import_path.starts_with(&format!("{}/", alias)) {
            let suffix = if import_path == *alias {
                "".to_string()
            } else {
                import_path[alias.len()..].to_string()
            };
            
            resolved_import_path = format!("{}{}", target, suffix);

            if !Path::new(&resolved_import_path).is_absolute() {
                resolved_import_path = Path::new(&project_root).join(&resolved_import_path).to_string_lossy().to_string();
            }
            break;
        }
    }

    let file_set: std::collections::HashSet<String> = all_files.into_iter().collect();
    
    let mut clean_path = resolved_import_path.clone();
    if clean_path.ends_with(".js") {
        clean_path = clean_path[..clean_path.len() - 3].to_string();
    } else if clean_path.ends_with(".jsx") {
        clean_path = clean_path[..clean_path.len() - 4].to_string();
    }

    let base_path = if Path::new(&clean_path).is_absolute() {
        PathBuf::from(&clean_path)
    } else {
        Path::new(&current_dir).join(&clean_path)
    };

    let extensions = vec![".ts", ".tsx", ".js", ".jsx", ".json", ".d.ts"];
    
    // 1. 확장자 탐색
    for ext in &extensions {
        let s = format!("{}{}", base_path.to_string_lossy(), ext);
        if file_set.contains(&s) {
            return Some(s);
        }
    }

    // 2. index 탐색
    for ext in &extensions {
        let p = base_path.join(format!("index{}", ext));
        let s = p.to_string_lossy().to_string();
        if file_set.contains(&s) {
            return Some(s);
        }
    }

    // 3. 원본 확인
    let original = if Path::new(&resolved_import_path).is_absolute() {
        resolved_import_path.clone()
    } else {
        Path::new(&current_dir).join(&resolved_import_path).to_string_lossy().to_string()
    };
    if file_set.contains(&original) {
        return Some(original);
    }

    None
}
