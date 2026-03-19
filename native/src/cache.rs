use std::path::Path;
use std::fs;
use crate::{SymbolResult, parser};
use dashmap::DashMap;
use once_cell::sync::Lazy;

pub struct AstCache {
    pub symbols: Vec<SymbolResult>,
    pub mtime: u64,
}

static AST_CACHE: Lazy<DashMap<String, AstCache>> = Lazy::new(DashMap::new);

#[napi]
pub fn parse_and_cache_native(file_path: String) -> Vec<SymbolResult> {
    let path = Path::new(&file_path);
    let mtime = fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs())
        .unwrap_or(0);

    if let Some(cached) = AST_CACHE.get(&file_path) {
        if cached.mtime == mtime {
            return cached.symbols.clone();
        }
    }

    let content = fs::read_to_string(&file_path).unwrap_or_default();
    let symbols = parser::extract_symbols_oxc(&content, &file_path);
    
    AST_CACHE.insert(file_path.clone(), AstCache {
        symbols: symbols.clone(),
        mtime,
    });

    symbols
}

#[napi]
pub fn clear_ast_cache_native() {
    AST_CACHE.clear();
}
