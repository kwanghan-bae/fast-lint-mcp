use std::path::Path;
use std::fs;
use crate::{SymbolResult, parser};
use dashmap::DashMap;
use once_cell::sync::Lazy;

/// [AstCache] 구조체는 파싱된 심볼 리스트와 파일의 수정 시간(mtime)을 저장합니다.
pub struct AstCache {
    pub symbols: Vec<SymbolResult>,
    pub mtime: u64,
}

/// [AST_CACHE]는 파일 경로를 키로 사용하는 전역 AST 캐시 저장소입니다.
/// DashMap을 사용하여 스레드 안전한 동시 접근을 지원합니다.
static AST_CACHE: Lazy<DashMap<String, AstCache>> = Lazy::new(DashMap::new);

/// [parse_and_cache_native] 함수는 파일을 파싱하고 결과를 캐싱합니다.
/// mtime이 동일한 경우 파싱을 건너뛰고 캐시된 결과를 반환합니다.
#[napi]
pub fn parse_and_cache_native(file_path: String) -> Vec<SymbolResult> {
    let path = Path::new(&file_path);
    // 파일의 수정 시간(mtime)을 가져옵니다.
    let mtime = fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs())
        .unwrap_or(0);

    // 캐시 히트 확인
    if let Some(cached) = AST_CACHE.get(&file_path) {
        if cached.mtime == mtime {
            return cached.symbols.clone();
        }
    }

    // 캐시 미스 시 파일 읽기 및 파싱
    let content = fs::read_to_string(&file_path).unwrap_or_default();
    let symbols = parser::extract_symbols_oxc(&content, &file_path);
    
    // 결과 캐싱
    AST_CACHE.insert(file_path.clone(), AstCache {
        symbols: symbols.clone(),
        mtime,
    });

    symbols
}

/// [clear_ast_cache_native] 함수는 전역 AST 캐시를 모두 비웁니다.
#[napi]
pub fn clear_ast_cache_native() {
    AST_CACHE.clear();
}
