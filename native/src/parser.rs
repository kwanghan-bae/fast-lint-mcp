use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_ast::ast::{Statement, Declaration, Expression, ClassElement};
use oxc_ast::AstKind;
use crate::{SymbolResult, COMPLEXITY_RE};
use regex::Regex;
use once_cell::sync::Lazy;

static KOREAN_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]").unwrap());
static COMMENT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"//|/\*|\*").unwrap());

pub fn is_trivial_symbol(name: &str) -> bool {
    // 1. 이름 길이가 3자 이하 (id, x, y, cb 등)
    if name.len() <= 3 { return true; }
    
    // 2. Getter/Setter 패턴 (getProp, setProp 등)
    if (name.starts_with("get") || name.starts_with("set")) && name.len() > 3 {
        let fourth_char = name.chars().nth(3).unwrap_or(' ');
        if fourth_char.is_uppercase() { return true; }
    }
    
    // 3. 클래스 메서드 내의 단순 이름 (ClassName.getProp)
    if let Some(pos) = name.find('.') {
        return is_trivial_symbol(&name[pos+1..]);
    }

    false
}

fn collect_local_identifiers(stmt: &Statement, ids: &mut Vec<String>) {
    match stmt {
        Statement::VariableDeclaration(decl) => {
            for d in &decl.declarations {
                collect_binding_pattern(&d.id, ids);
            }
        },
        Statement::BlockStatement(block) => {
            for s in &block.body {
                collect_local_identifiers(s, ids);
            }
        },
        Statement::IfStatement(if_stmt) => {
            collect_local_identifiers(&if_stmt.consequent, ids);
            if let Some(alt) = &if_stmt.alternate {
                collect_local_identifiers(alt, ids);
            }
        },
        Statement::ForStatement(for_stmt) => {
            if let Some(init) = &for_stmt.init {
                match init {
                    oxc_ast::ast::ForStatementInit::VariableDeclaration(decl) => {
                        for d in &decl.declarations {
                            collect_binding_pattern(&d.id, ids);
                        }
                    },
                    _ => {}
                }
            }
            collect_local_identifiers(&for_stmt.body, ids);
        },
        Statement::ForInStatement(for_in) => {
            match &for_in.left {
                oxc_ast::ast::ForStatementLeft::VariableDeclaration(decl) => {
                    for d in &decl.declarations {
                        collect_binding_pattern(&d.id, ids);
                    }
                },
                _ => {}
            }
            collect_local_identifiers(&for_in.body, ids);
        },
        Statement::ForOfStatement(for_of) => {
            match &for_of.left {
                oxc_ast::ast::ForStatementLeft::VariableDeclaration(decl) => {
                    for d in &decl.declarations {
                        collect_binding_pattern(&d.id, ids);
                    }
                },
                _ => {}
            }
            collect_local_identifiers(&for_of.body, ids);
        },
        Statement::TryStatement(try_stmt) => {
            for s in &try_stmt.block.body {
                collect_local_identifiers(s, ids);
            }
            if let Some(handler) = &try_stmt.handler {
                if let Some(param) = &handler.param {
                    collect_binding_pattern(&param.pattern, ids);
                }
                for s in &handler.body.body {
                    collect_local_identifiers(s, ids);
                }
            }
            if let Some(finalizer) = &try_stmt.finalizer {
                for s in &finalizer.body {
                    collect_local_identifiers(s, ids);
                }
            }
        },
        _ => {}
    }
}

fn collect_binding_pattern(pat: &oxc_ast::ast::BindingPattern, ids: &mut Vec<String>) {
    use oxc_ast::ast::BindingPattern;
    match pat {
        BindingPattern::BindingIdentifier(id) => {
            ids.push(id.name.to_string());
        },
        BindingPattern::ObjectPattern(obj) => {
            for prop in &obj.properties {
                collect_binding_pattern(&prop.value, ids);
            }
            if let Some(rest) = &obj.rest {
                collect_binding_pattern(&rest.argument, ids);
            }
        },
        BindingPattern::ArrayPattern(arr) => {
            for el in &arr.elements {
                if let Some(e) = el {
                    collect_binding_pattern(e, ids);
                }
            }
            if let Some(rest) = &arr.rest {
                collect_binding_pattern(&rest.argument, ids);
            }
        },
        _ => {}
    }
}

pub fn is_ignored_by_comment(lines: &[&str], start_line: usize) -> bool {
    let check_start = if start_line > 3 { start_line - 3 } else { 0 };
    for i in check_start..start_line {
        if let Some(line) = lines.get(i) {
            if line.contains("fast-lint-ignore") {
                return true;
            }
        }
    }
    false
}

pub fn extract_symbols_oxc(source_text: &str, file_path: &str) -> Vec<SymbolResult> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    let ret = Parser::new(&allocator, source_text, source_type).parse();
    
    let mut symbols = Vec::new();
    let lines: Vec<&str> = source_text.lines().collect();
    
    // v3.8.9: 설정 파일 및 테스트 파일은 가독성(한글 주석) 검사 우회
    let is_test_or_config = file_path.contains(".config.") 
        || file_path.contains(".setup.") 
        || file_path.contains("rc.") 
        || file_path.ends_with("rc")
        || file_path.contains("/tests/") 
        || file_path.contains("/__tests__/")
        || file_path.contains(".test.")
        || file_path.contains(".spec.");

    // v3.8.9: 복잡도 계산 시 문자열 리터럴 및 JSX 텍스트 제거를 위한 정규식
    let re_strings_for_complexity = Regex::new(r#"'[^']*'|"[^"]*"|`[^`]*`|<[^>]+>"#).unwrap();

    let get_clean_complexity = |snippet: &str| -> i32 {
        let clean_snippet = re_strings_for_complexity.replace_all(snippet, " ");
        COMPLEXITY_RE.find_iter(&clean_snippet).count() as i32 + 1
    };

    if ret.errors.is_empty() {
       for stmt in &ret.program.body {
           match stmt {
               Statement::ExportNamedDeclaration(decl) => {
                   if let Some(decl_body) = &decl.declaration {
                       match decl_body {
                           Declaration::FunctionDeclaration(func) => {
                               if let Some(id) = &func.id {
                                   let start_line = count_lines(&source_text[..func.span.start as usize]) + 1;
                                   let end_line = count_lines(&source_text[..func.span.end as usize]) + 1;
                                   let snippet = &source_text[func.span.start as usize..func.span.end as usize];
                                   let complexity = get_clean_complexity(snippet);
                                   let name = id.name.to_string();
                                   let has_korean = is_test_or_config || has_korean_comment_above(&lines, start_line as usize, 10) || is_trivial_symbol(&name);

                                   symbols.push(SymbolResult {
                                       name,
                                       line: start_line as u32,
                                       end_line: end_line as u32,
                                       is_exported: true,
                                       kind: "function".to_string(),
                                       complexity,
                                       lines: (end_line - start_line + 1) as i32,
                                       parameter_count: func.params.items.len() as i32,
                                       has_korean_comment: has_korean,
                                       local_identifiers: Vec::new(),
                                   });
                               }
                           },
                           Declaration::ClassDeclaration(cls) => {
                               if let Some(id) = &cls.id {
                                   let start_line = count_lines(&source_text[..cls.span.start as usize]) + 1;
                                   let end_line = count_lines(&source_text[..cls.span.end as usize]) + 1;
                                   let name = id.name.to_string();
                                   let has_korean = is_test_or_config || has_korean_comment_above(&lines, start_line as usize, 10) || is_trivial_symbol(&name);
                                   
                                   symbols.push(SymbolResult {
                                       name: name.clone(),
                                       line: start_line as u32,
                                       end_line: end_line as u32,
                                       is_exported: true,
                                       kind: "class".to_string(),
                                       complexity: 1,
                                       lines: (end_line - start_line + 1) as i32,
                                       parameter_count: 0,
                                       has_korean_comment: has_korean,
                                       local_identifiers: Vec::new(),
                                   });

                                   process_class_body(cls, &name, source_text, &mut symbols, &lines, is_test_or_config, &re_strings_for_complexity);
                               }
                           },
                           Declaration::VariableDeclaration(var_decl) => {
                               for declarator in &var_decl.declarations {
                                   if let Some(id) = declarator.id.get_binding_identifier() {
                                       let start_line = count_lines(&source_text[..declarator.span.start as usize]) + 1;
                                       let end_line = count_lines(&source_text[..declarator.span.end as usize]) + 1;
                                       let snippet = &source_text[declarator.span.start as usize..declarator.span.end as usize];
                                       let complexity = get_clean_complexity(snippet);
                                       let name = id.name.to_string();
                                       let has_korean = is_test_or_config || has_korean_comment_above(&lines, start_line as usize, 10) || is_trivial_symbol(&name);

                                       symbols.push(SymbolResult {
                                           name,
                                           line: start_line as u32,
                                           end_line: end_line as u32,
                                           is_exported: true,
                                           kind: "variable".to_string(), 
                                           complexity,
                                           lines: (end_line - start_line + 1) as i32,
                                           parameter_count: 0,
                                           has_korean_comment: has_korean,
                                           local_identifiers: Vec::new(),
                                       });
                                   }
                               }
                           },
                           _ => {}
                       }
                   }
               },
               Statement::ExportDefaultDeclaration(decl) => {
                   match &decl.declaration {
                       oxc_ast::ast::ExportDefaultDeclarationKind::FunctionDeclaration(func) => {
                           let start_line = count_lines(&source_text[..func.span.start as usize]) + 1;
                           let end_line = count_lines(&source_text[..func.span.end as usize]) + 1;
                           let snippet = &source_text[func.span.start as usize..func.span.end as usize];
                           let complexity = get_clean_complexity(snippet);
                           
                           let name = if let Some(id) = &func.id {
                               id.name.to_string()
                           } else {
                               let file_name = std::path::Path::new(file_path).file_name().unwrap_or_default().to_string_lossy();
                               format!("default ({})", file_name)
                           };
                           let has_korean = is_test_or_config || has_korean_comment_above(&lines, start_line as usize, 10) || is_trivial_symbol(&name);

                           let mut local_identifiers = Vec::new();
                           for param in &func.params.items {
                               collect_binding_pattern(&param.pattern, &mut local_identifiers);
                           }
                           if let Some(body) = &func.body {
                               for s in &body.statements {
                                   collect_local_identifiers(s, &mut local_identifiers);
                               }
                           }

                           symbols.push(SymbolResult {
                               name,
                               line: start_line as u32,
                               end_line: end_line as u32,
                               is_exported: true,
                               kind: "function".to_string(),
                               complexity,
                               lines: (end_line - start_line + 1) as i32,
                               parameter_count: func.params.items.len() as i32,
                               has_korean_comment: has_korean,
                               local_identifiers,
                           });
                       },
                       oxc_ast::ast::ExportDefaultDeclarationKind::ClassDeclaration(cls) => {
                           let start_line = count_lines(&source_text[..cls.span.start as usize]) + 1;
                           let end_line = count_lines(&source_text[..cls.span.end as usize]) + 1;
                           let name = if let Some(id) = &cls.id {
                               id.name.to_string()
                           } else {
                               let file_name = std::path::Path::new(file_path).file_name().unwrap_or_default().to_string_lossy();
                               format!("default ({})", file_name)
                           };
                           let has_korean = is_test_or_config || has_korean_comment_above(&lines, start_line as usize, 10) || is_trivial_symbol(&name);
                           
                           symbols.push(SymbolResult {
                               name: name.clone(),
                               line: start_line as u32,
                               end_line: end_line as u32,
                               is_exported: true,
                               kind: "class".to_string(),
                               complexity: 1,
                               lines: (end_line - start_line + 1) as i32,
                               parameter_count: 0,
                               has_korean_comment: has_korean,
                               local_identifiers: Vec::new(),
                           });

                           process_class_body(cls, &name, source_text, &mut symbols, &lines, is_test_or_config, &re_strings_for_complexity);
                       },
                       _ => {}
                   }
               },
               Statement::FunctionDeclaration(func) => {
                   if let Some(id) = &func.id {
                       let start_line = count_lines(&source_text[..func.span.start as usize]) + 1;
                       let end_line = count_lines(&source_text[..func.span.end as usize]) + 1;
                       let snippet = &source_text[func.span.start as usize..func.span.end as usize];
                       let complexity = get_clean_complexity(snippet);
                       let name = id.name.to_string();
                       // v3.8.7: Export 되지 않은 내부 함수는 한글 주석 요구 완화
                       let has_korean = true; 

                       let mut local_identifiers = Vec::new();
                       for param in &func.params.items {
                           collect_binding_pattern(&param.pattern, &mut local_identifiers);
                       }
                       if let Some(body) = &func.body {
                           for s in &body.statements {
                               collect_local_identifiers(s, &mut local_identifiers);
                           }
                       }

                       symbols.push(SymbolResult {
                           name,
                           line: start_line as u32,
                           end_line: end_line as u32,
                           is_exported: false,
                           kind: "function".to_string(),
                           complexity,
                           lines: (end_line - start_line + 1) as i32,
                           parameter_count: func.params.items.len() as i32,
                           has_korean_comment: has_korean,
                           local_identifiers,
                       });
                   }
               },
               Statement::VariableDeclaration(var_decl) => {
                   for declarator in &var_decl.declarations {
                       if let Some(id) = declarator.id.get_binding_identifier() {
                           let start_line = count_lines(&source_text[..declarator.span.start as usize]) + 1;
                           let end_line = count_lines(&source_text[..declarator.span.end as usize]) + 1;
                           let snippet = &source_text[declarator.span.start as usize..declarator.span.end as usize];
                           let complexity = get_clean_complexity(snippet);
                           let name = id.name.to_string();
                           // v3.8.7: Export 되지 않은 로컬 변수는 한글 주석 요구 완화
                           let has_korean = true; 

                           symbols.push(SymbolResult {
                               name,
                               line: start_line as u32,
                               end_line: end_line as u32,
                               is_exported: false,
                               kind: "variable".to_string(),
                               complexity,
                               lines: (end_line - start_line + 1) as i32,
                               parameter_count: 0,
                               has_korean_comment: has_korean,
                               local_identifiers: Vec::new(),
                           });
                       }
                   }
               },
               Statement::ClassDeclaration(cls) => {
                   if let Some(id) = &cls.id {
                       let start_line = count_lines(&source_text[..cls.span.start as usize]) + 1;
                       let end_line = count_lines(&source_text[..cls.span.end as usize]) + 1;
                       let name = id.name.to_string();
                       // v3.8.7: Export 되지 않은 내부 클래스는 한글 주석 요구 완화
                       let has_korean = true; 
                       
                       symbols.push(SymbolResult {
                           name: name.clone(),
                           line: start_line as u32,
                           end_line: end_line as u32,
                           is_exported: false,
                           kind: "class".to_string(),
                           complexity: 1,
                           lines: (end_line - start_line + 1) as i32,
                           parameter_count: 0,
                           has_korean_comment: has_korean,
                           local_identifiers: Vec::new(),
                       });

                       process_class_body(cls, &name, source_text, &mut symbols, &lines, is_test_or_config, &re_strings_for_complexity);
                   }
               },
               Statement::ExpressionStatement(expr_stmt) => {
                   if let Expression::CallExpression(call) = &expr_stmt.expression {
                       if let Expression::Identifier(id) = &call.callee {
                           if id.name == "describe" || id.name == "it" || id.name == "test" || id.name == "beforeEach" || id.name == "afterEach" {
                               let start_line = count_lines(&source_text[..call.span.start as usize]) + 1;
                               let end_line = count_lines(&source_text[..call.span.end as usize]) + 1;
                               let name = id.name.to_string();
                               let has_korean = is_test_or_config || has_korean_comment_above(&lines, start_line as usize, 10) || is_trivial_symbol(&name);
                               
                               let label = if id.name == "describe" { "suite" } else { "test_logic" };

                               symbols.push(SymbolResult {
                                   name,
                                   line: start_line as u32,
                                   end_line: end_line as u32,
                                   is_exported: false,
                                   kind: label.to_string(),
                                   complexity: 1,
                                   lines: (end_line - start_line + 1) as i32,
                                   parameter_count: 0,
                                   has_korean_comment: has_korean,
                                   local_identifiers: Vec::new(),
                               });
                           }
                       }
                   } else if let Expression::AssignmentExpression(assign) = &expr_stmt.expression {
                       let start_line = count_lines(&source_text[..assign.span.start as usize]) + 1;
                       let end_line = count_lines(&source_text[..assign.span.end as usize]) + 1;
                       
                       use oxc_span::GetSpan;
                       let span = assign.left.span();
                       let name = source_text[span.start as usize..span.end as usize].to_string();
                       let has_korean = is_test_or_config || has_korean_comment_above(&lines, start_line as usize, 10) || is_trivial_symbol(&name);

                       symbols.push(SymbolResult {
                           name,
                           line: start_line as u32,
                           end_line: end_line as u32,
                           is_exported: false,
                           kind: "assignment".to_string(),
                           complexity: 1,
                           lines: (end_line - start_line + 1) as i32,
                           parameter_count: 0,
                           has_korean_comment: has_korean,
                           local_identifiers: Vec::new(),
                       });
                   }
               },
               _ => {}
           }
       }
    }
    
    // v3.9.1: 인라인 무시(Inline Ignore) 태그가 있는 심볼은 결과에서 제외
    symbols.retain(|s| !is_ignored_by_comment(&lines, s.line as usize));
    
    symbols
}

fn process_class_body(cls: &oxc_ast::ast::Class, class_name: &str, source_text: &str, symbols: &mut Vec<SymbolResult>, lines: &[&str], is_test_or_config: bool, re_strings: &Regex) {
    for el in &cls.body.body {
        match el {
            ClassElement::MethodDefinition(method) => {
                if let oxc_ast::ast::PropertyKey::StaticIdentifier(method_id) = &method.key {
                    let m_start = count_lines(&source_text[..method.span.start as usize]) + 1;
                    let m_end = count_lines(&source_text[..method.span.end as usize]) + 1;
                    let m_snippet = &source_text[method.span.start as usize..method.span.end as usize];
                    
                    let clean_snippet = re_strings.replace_all(m_snippet, " ");
                    let m_complexity = COMPLEXITY_RE.find_iter(&clean_snippet).count() as i32 + 1;
                    
                    let name = format!("{}.{}", class_name, method_id.name);
                    
                    // v3.8.7: Private 메서드(_, # 등)는 주석 요구 완화
                    let has_korean = if is_test_or_config || method_id.name.starts_with('_') || method_id.name.starts_with('#') {
                        true
                    } else {
                        has_korean_comment_above(lines, m_start as usize, 10) || is_trivial_symbol(&name)
                    };

                    let mut local_identifiers = Vec::new();
                    for param in &method.value.params.items {
                        collect_binding_pattern(&param.pattern, &mut local_identifiers);
                    }
                    if let Some(body) = &method.value.body {
                        for s in &body.statements {
                            collect_local_identifiers(s, &mut local_identifiers);
                        }
                    }

                    symbols.push(SymbolResult {
                        name,
                        line: m_start as u32,
                        end_line: m_end as u32,
                        is_exported: false,
                        kind: "method".to_string(),
                        complexity: m_complexity,
                        lines: (m_end - m_start + 1) as i32,
                        parameter_count: method.value.params.items.len() as i32,
                        has_korean_comment: has_korean,
                        local_identifiers,
                    });
                }
            },
            ClassElement::PropertyDefinition(prop) => {
                if let oxc_ast::ast::PropertyKey::StaticIdentifier(prop_id) = &prop.key {
                    let p_start = count_lines(&source_text[..prop.span.start as usize]) + 1;
                    let p_end = count_lines(&source_text[..prop.span.end as usize]) + 1;
                    let name = format!("{}.{}", class_name, prop_id.name);
                    let has_korean = is_test_or_config || has_korean_comment_above(lines, p_start as usize, 10) || is_trivial_symbol(&name);

                    symbols.push(SymbolResult {
                        name,
                        line: p_start as u32,
                        end_line: p_end as u32,
                        is_exported: false,
                        kind: "field".to_string(),
                        complexity: 1,
                        lines: (p_end - p_start + 1) as i32,
                        parameter_count: 0,
                        has_korean_comment: has_korean,
                        local_identifiers: Vec::new(),
                    });
                }
            },
            _ => {}
        }
    }
}

pub fn count_lines(s: &str) -> usize {
    if s.is_empty() { return 0; }
    s.chars().filter(|&c| c == '\n').count()
}

pub fn has_korean_comment_above(lines: &[&str], start_line: usize, search_depth: usize) -> bool {
    let start = if start_line > search_depth { start_line - search_depth } else { 1 };
    let end = start_line;

    for i in (start..end).rev() {
        let idx = i - 1;
        if idx < lines.len() {
            let l = lines[idx];
            if COMMENT_RE.is_match(l) && KOREAN_RE.is_match(l) {
                return true;
            }
        }
    }
    false
}

#[derive(Debug, Clone)]
pub struct Mutant {
    pub original: String,
    pub mutation: String,
    pub line: u32,
    pub content: String,
}

pub fn generate_mutations_oxc(source_text: &str, file_path: &str) -> Vec<Mutant> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    let ret = Parser::new(&allocator, source_text, source_type).parse();
    
    let mut mutants = Vec::new();
    
    if ret.errors.is_empty() {
        let patterns = [
            ("===", "!=="),
            ("!==", "==="),
            ("==", "!="),
            ("!=", "=="),
            (" > ", " < "),
            (" < ", " > "),
            ("true", "false"),
            ("false", "true"),
        ];

        for (orig, muta) in patterns {
            if let Some(pos) = source_text.find(orig) {
                let start_line = count_lines(&source_text[..pos]) + 1;
                let mut mutated_content = source_text.to_string();
                mutated_content.replace_range(pos..pos+orig.len(), muta);
                
                mutants.push(Mutant {
                    original: orig.to_string(),
                    mutation: muta.to_string(),
                    line: start_line as u32,
                    content: mutated_content,
                });
            }
        }
    }
    
    mutants
}

pub fn fix_readability_oxc(source_text: &str, file_path: &str) -> (String, i32) {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    let ret = Parser::new(&allocator, source_text, source_type).parse();
    
    if !ret.errors.is_empty() {
        return (source_text.to_string(), 0);
    }

    let mut fixed_content = String::new();
    let mut last_pos = 0;
    let mut fix_count = 0;
    let lines: Vec<&str> = source_text.lines().collect();

    let mut insert_points = Vec::new();

    for stmt in &ret.program.body {
        match stmt {
            Statement::ExportNamedDeclaration(decl) => {
                if let Some(decl_body) = &decl.declaration {
                    match decl_body {
                        Declaration::FunctionDeclaration(func) => {
                            if let Some(id) = &func.id {
                                let name = id.name.to_string();
                                let start_line = count_lines(&source_text[..func.span.start as usize]) + 1;
                                if !is_trivial_symbol(&name) && !has_korean_comment_above(&lines, start_line as usize, 10) {
                                    insert_points.push((func.span.start as usize, format!("// {} 함수는 역할을 수행합니다.\n", name)));
                                }
                            }
                        },
                        Declaration::ClassDeclaration(cls) => {
                            if let Some(id) = &cls.id {
                                let name = id.name.to_string();
                                let start_line = count_lines(&source_text[..cls.span.start as usize]) + 1;
                                if !is_trivial_symbol(&name) && !has_korean_comment_above(&lines, start_line as usize, 10) {
                                    insert_points.push((cls.span.start as usize, format!("// {} 클래스는 역할을 담당합니다.\n", name)));
                                }
                            }
                        },
                        _ => {}
                    }
                }
            },
            Statement::FunctionDeclaration(func) => {
                if let Some(id) = &func.id {
                    let name = id.name.to_string();
                    let start_line = count_lines(&source_text[..func.span.start as usize]) + 1;
                    if !is_trivial_symbol(&name) && !has_korean_comment_above(&lines, start_line as usize, 10) {
                        insert_points.push((func.span.start as usize, format!("// {} 함수는 내부 로직을 처리합니다.\n", name)));
                    }
                }
            },
            Statement::ClassDeclaration(cls) => {
                if let Some(id) = &cls.id {
                    let name = id.name.to_string();
                    let start_line = count_lines(&source_text[..cls.span.start as usize]) + 1;
                    if !is_trivial_symbol(&name) && !has_korean_comment_above(&lines, start_line as usize, 10) {
                        insert_points.push((cls.span.start as usize, format!("// {} 클래스는 내부 상태를 관리합니다.\n", name)));
                    }
                }
            },
            _ => {}
        }
    }

    insert_points.sort_by_key(|p| p.0);

    for (pos, comment) in insert_points {
        fixed_content.push_str(&source_text[last_pos..pos]);
        fixed_content.push_str(&comment);
        last_pos = pos;
        fix_count += 1;
    }
    fixed_content.push_str(&source_text[last_pos..]);

    (fixed_content, fix_count)
}

pub fn detect_deep_nesting_oxc(source_text: &str, file_path: &str) -> Vec<u32> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    let ret = Parser::new(&allocator, source_text, source_type).parse();
    let mut deep_lines = Vec::new();

    if ret.errors.is_empty() {
        for stmt in &ret.program.body {
            walk_statement(stmt, source_text, &mut deep_lines, 0);
        }
    }
    deep_lines
}

fn walk_statement(stmt: &Statement, source_text: &str, deep_lines: &mut Vec<u32>, depth: i32) {
    match stmt {
        Statement::IfStatement(if_stmt) => {
            let new_depth = depth + 1;
            if new_depth >= 3 {
                let line = count_lines(&source_text[..if_stmt.span.start as usize]) + 1;
                deep_lines.push(line as u32);
            }
            walk_statement(&if_stmt.consequent, source_text, deep_lines, new_depth);
            if let Some(alt) = &if_stmt.alternate {
                walk_statement(alt, source_text, deep_lines, depth); 
            }
        },
        Statement::BlockStatement(block) => {
            for s in &block.body {
                walk_statement(s, source_text, deep_lines, depth);
            }
        },
        Statement::FunctionDeclaration(func) => {
            if let Some(body) = &func.body {
                for s in &body.statements {
                    walk_statement(s, source_text, deep_lines, 0); 
                }
            }
        },
        _ => {}
    }
}
