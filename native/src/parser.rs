use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_ast::ast::{Statement, Declaration};
use crate::{SymbolResult, COMPLEXITY_RE};
use regex::Regex;
use once_cell::sync::Lazy;

static KOREAN_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]").unwrap());
static COMMENT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"//|/\*|\*").unwrap());

pub fn extract_symbols_oxc(source_text: &str, file_path: &str) -> Vec<SymbolResult> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    let ret = Parser::new(&allocator, source_text, source_type).parse();
    
    let mut symbols = Vec::new();
    let lines: Vec<&str> = source_text.lines().collect();
    
    if ret.errors.is_empty() {
       for stmt in &ret.program.body {
           match stmt {
               Statement::ExportNamedDeclaration(decl) => {
                   if let Some(decl_body) = &decl.declaration {
                       match decl_body {
                           Declaration::FunctionDeclaration(func) => {
                               if let Some(id) = &func.id {
                                   let start_line = count_lines(&source_text[..func.span.start as usize]) + 1;
                                   let end_line = count_lines(&source_text[..func.span.end as usize]);
                                   let snippet = &source_text[func.span.start as usize..func.span.end as usize];
                                   let complexity = COMPLEXITY_RE.find_iter(snippet).count() as i32 + 1;
                                   let has_korean = has_korean_comment_above(&lines, start_line as usize, 3);

                                   symbols.push(SymbolResult {
                                       name: id.name.to_string(),
                                       line: start_line as u32,
                                       end_line: end_line as u32,
                                       is_exported: true,
                                       kind: "function".to_string(),
                                       complexity,
                                       lines: (end_line - start_line + 1) as i32,
                                       parameter_count: func.params.items.len() as i32,
                                       has_korean_comment: has_korean,
                                   });
                               }
                           },
                           Declaration::ClassDeclaration(cls) => {
                               if let Some(id) = &cls.id {
                                   let start_line = count_lines(&source_text[..cls.span.start as usize]) + 1;
                                   let end_line = count_lines(&source_text[..cls.span.end as usize]);
                                   let has_korean = has_korean_comment_above(&lines, start_line as usize, 3);
                                   
                                   symbols.push(SymbolResult {
                                       name: id.name.to_string(),
                                       line: start_line as u32,
                                       end_line: end_line as u32,
                                       is_exported: true,
                                       kind: "class".to_string(),
                                       complexity: 1,
                                       lines: (end_line - start_line + 1) as i32,
                                       parameter_count: 0,
                                       has_korean_comment: has_korean,
                                   });

                                   process_class_body(cls, &id.name, source_text, &mut symbols, &lines);
                               }
                           },
                           Declaration::VariableDeclaration(var_decl) => {
                               for declarator in &var_decl.declarations {
                                   if let Some(id) = declarator.id.get_binding_identifier() {
                                       let start_line = count_lines(&source_text[..declarator.span.start as usize]) + 1;
                                       let end_line = count_lines(&source_text[..declarator.span.end as usize]);
                                       let snippet = &source_text[declarator.span.start as usize..declarator.span.end as usize];
                                       let complexity = COMPLEXITY_RE.find_iter(snippet).count() as i32 + 1;
                                       let has_korean = has_korean_comment_above(&lines, start_line as usize, 3);

                                       symbols.push(SymbolResult {
                                           name: id.name.to_string(),
                                           line: start_line as u32,
                                           end_line: end_line as u32,
                                           is_exported: true,
                                           kind: "function".to_string(), 
                                           complexity,
                                           lines: (end_line - start_line + 1) as i32,
                                           parameter_count: 0, 
                                           has_korean_comment: has_korean,
                                       });
                                   }
                               }
                           },
                           _ => {}
                       }
                   }
               },
               Statement::FunctionDeclaration(func) => {
                   if let Some(id) = &func.id {
                       let start_line = count_lines(&source_text[..func.span.start as usize]) + 1;
                       let end_line = count_lines(&source_text[..func.span.end as usize]);
                       let snippet = &source_text[func.span.start as usize..func.span.end as usize];
                       let complexity = COMPLEXITY_RE.find_iter(snippet).count() as i32 + 1;
                       let has_korean = has_korean_comment_above(&lines, start_line as usize, 3);

                       symbols.push(SymbolResult {
                           name: id.name.to_string(),
                           line: start_line as u32,
                           end_line: end_line as u32,
                           is_exported: false,
                           kind: "function".to_string(),
                           complexity,
                           lines: (end_line - start_line + 1) as i32,
                           parameter_count: func.params.items.len() as i32,
                           has_korean_comment: has_korean,
                       });
                   }
               },
               Statement::VariableDeclaration(var_decl) => {
                   for declarator in &var_decl.declarations {
                       if let Some(id) = declarator.id.get_binding_identifier() {
                           let start_line = count_lines(&source_text[..declarator.span.start as usize]) + 1;
                           let end_line = count_lines(&source_text[..declarator.span.end as usize]);
                           let snippet = &source_text[declarator.span.start as usize..declarator.span.end as usize];
                           let complexity = COMPLEXITY_RE.find_iter(snippet).count() as i32 + 1;
                           let has_korean = has_korean_comment_above(&lines, start_line as usize, 3);

                           symbols.push(SymbolResult {
                               name: id.name.to_string(),
                               line: start_line as u32,
                               end_line: end_line as u32,
                               is_exported: false,
                               kind: "function".to_string(),
                               complexity,
                               lines: (end_line - start_line + 1) as i32,
                               parameter_count: 0,
                               has_korean_comment: has_korean,
                           });
                       }
                   }
               },
               Statement::ClassDeclaration(cls) => {
                   if let Some(id) = &cls.id {
                       let start_line = count_lines(&source_text[..cls.span.start as usize]) + 1;
                       let end_line = count_lines(&source_text[..cls.span.end as usize]);
                       let has_korean = has_korean_comment_above(&lines, start_line as usize, 3);
                       
                       symbols.push(SymbolResult {
                           name: id.name.to_string(),
                           line: start_line as u32,
                           end_line: end_line as u32,
                           is_exported: false,
                           kind: "class".to_string(),
                           complexity: 1,
                           lines: (end_line - start_line + 1) as i32,
                           parameter_count: 0,
                           has_korean_comment: has_korean,
                       });

                       process_class_body(cls, &id.name, source_text, &mut symbols, &lines);
                   }
               },
               _ => {}
           }
       }
    }
    
    symbols
}

fn process_class_body(cls: &oxc_ast::ast::Class, class_name: &str, source_text: &str, symbols: &mut Vec<SymbolResult>, lines: &[&str]) {
    for el in &cls.body.body {
        if let oxc_ast::ast::ClassElement::MethodDefinition(method) = el {
            if let oxc_ast::ast::PropertyKey::StaticIdentifier(method_id) = &method.key {
                if method_id.name != "constructor" {
                     let m_start = count_lines(&source_text[..method.span.start as usize]) + 1;
                     let m_end = count_lines(&source_text[..method.span.end as usize]);
                     let m_snippet = &source_text[method.span.start as usize..method.span.end as usize];
                     let m_complexity = COMPLEXITY_RE.find_iter(m_snippet).count() as i32 + 1;
                     let has_korean = has_korean_comment_above(lines, m_start as usize, 3);

                     symbols.push(SymbolResult {
                         name: format!("{}.{}", class_name, method_id.name),
                         line: m_start as u32,
                         end_line: m_end as u32,
                         is_exported: false,
                         kind: "method".to_string(),
                         complexity: m_complexity,
                         lines: (m_end - m_start + 1) as i32,
                         parameter_count: method.value.params.items.len() as i32,
                         has_korean_comment: has_korean,
                     });
                }
            }
        } else if let oxc_ast::ast::ClassElement::PropertyDefinition(prop) = el {
            if let oxc_ast::ast::PropertyKey::StaticIdentifier(prop_id) = &prop.key {
                let p_start = count_lines(&source_text[..prop.span.start as usize]) + 1;
                let p_end = count_lines(&source_text[..prop.span.end as usize]);
                let has_korean = has_korean_comment_above(lines, p_start as usize, 3);

                symbols.push(SymbolResult {
                    name: format!("{}.{}", class_name, prop_id.name),
                    line: p_start as u32,
                    end_line: p_end as u32,
                    is_exported: false,
                    kind: "field".to_string(),
                    complexity: 1,
                    lines: (p_end - p_start + 1) as i32,
                    parameter_count: 0,
                    has_korean_comment: has_korean,
                });
            }
        }
    }
}

pub fn count_lines(s: &str) -> usize {
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

    // We collect points where we want to insert comments
    let mut insert_points = Vec::new();

    for stmt in &ret.program.body {
        match stmt {
            Statement::ExportNamedDeclaration(decl) => {
                if let Some(decl_body) = &decl.declaration {
                    match decl_body {
                        Declaration::FunctionDeclaration(func) => {
                            if let Some(id) = &func.id {
                                let start_line = count_lines(&source_text[..func.span.start as usize]) + 1;
                                if !has_korean_comment_above(&lines, start_line as usize, 3) {
                                    insert_points.push((func.span.start as usize, format!("// {} 함수는 역할을 수행합니다.\n", id.name)));
                                }
                            }
                        },
                        Declaration::ClassDeclaration(cls) => {
                            if let Some(id) = &cls.id {
                                let start_line = count_lines(&source_text[..cls.span.start as usize]) + 1;
                                if !has_korean_comment_above(&lines, start_line as usize, 3) {
                                    insert_points.push((cls.span.start as usize, format!("// {} 클래스는 역할을 담당합니다.\n", id.name)));
                                }
                            }
                        },
                        _ => {}
                    }
                }
            },
            Statement::FunctionDeclaration(func) => {
                if let Some(id) = &func.id {
                    let start_line = count_lines(&source_text[..func.span.start as usize]) + 1;
                    if !has_korean_comment_above(&lines, start_line as usize, 3) {
                        insert_points.push((func.span.start as usize, format!("// {} 함수는 내부 로직을 처리합니다.\n", id.name)));
                    }
                }
            },
            Statement::ClassDeclaration(cls) => {
                if let Some(id) = &cls.id {
                    let start_line = count_lines(&source_text[..cls.span.start as usize]) + 1;
                    if !has_korean_comment_above(&lines, start_line as usize, 3) {
                        insert_points.push((cls.span.start as usize, format!("// {} 클래스는 내부 상태를 관리합니다.\n", id.name)));
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
