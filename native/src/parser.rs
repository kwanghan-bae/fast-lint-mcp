use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_ast::ast::{Statement, Declaration};
use crate::{SymbolResult, COMPLEXITY_RE};

pub fn extract_symbols_oxc(source_text: &str, file_path: &str) -> Vec<SymbolResult> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    let ret = Parser::new(&allocator, source_text, source_type).parse();
    
    let mut symbols = Vec::new();
    
    if ret.errors.is_empty() {
       for stmt in &ret.program.body {
           match stmt {
               Statement::ExportNamedDeclaration(decl) => {
                   if let Some(Declaration::FunctionDeclaration(func)) = &decl.declaration {
                       if let Some(id) = &func.id {
                           let start_line = count_lines(&source_text[..func.span.start as usize]) + 1;
                           let end_line = count_lines(&source_text[..func.span.end as usize]);
                           let snippet = &source_text[func.span.start as usize..func.span.end as usize];
                           let complexity = COMPLEXITY_RE.find_iter(snippet).count() as i32 + 1;

                           symbols.push(SymbolResult {
                               name: id.name.to_string(),
                               line: start_line as u32,
                               end_line: end_line as u32,
                               is_exported: true,
                               kind: "function".to_string(),
                               complexity,
                               lines: (end_line - start_line + 1) as i32,
                           });
                       }
                   }
                   if let Some(Declaration::VariableDeclaration(var_decl)) = &decl.declaration {
                       for declarator in &var_decl.declarations {
                           if let Some(id) = declarator.id.get_binding_identifier() {
                               let start_line = count_lines(&source_text[..declarator.span.start as usize]) + 1;
                               let end_line = count_lines(&source_text[..declarator.span.end as usize]);
                               let snippet = &source_text[declarator.span.start as usize..declarator.span.end as usize];
                               let complexity = COMPLEXITY_RE.find_iter(snippet).count() as i32 + 1;

                               symbols.push(SymbolResult {
                                   name: id.name.to_string(),
                                   line: start_line as u32,
                                   end_line: end_line as u32,
                                   is_exported: true,
                                   kind: "function".to_string(), // Keep consistent with existing logic
                                   complexity,
                                   lines: (end_line - start_line + 1) as i32,
                               });
                           }
                       }
                   }
                   if let Some(Declaration::ClassDeclaration(cls)) = &decl.declaration {
                       if let Some(id) = &cls.id {
                           let start_line = count_lines(&source_text[..cls.span.start as usize]) + 1;
                           let end_line = count_lines(&source_text[..cls.span.end as usize]);
                           
                           symbols.push(SymbolResult {
                               name: id.name.to_string(),
                               line: start_line as u32,
                               end_line: end_line as u32,
                               is_exported: true,
                               kind: "class".to_string(),
                               complexity: 1, // existing logic mostly sets 1 for class itself
                               lines: (end_line - start_line + 1) as i32,
                           });

                           for el in &cls.body.body {
                               if let oxc_ast::ast::ClassElement::MethodDefinition(method) = el {
                                   if let oxc_ast::ast::PropertyKey::StaticIdentifier(method_id) = &method.key {
                                       if method_id.name != "constructor" {
                                            let m_start = count_lines(&source_text[..method.span.start as usize]) + 1;
                                            let m_end = count_lines(&source_text[..method.span.end as usize]);
                                            let m_snippet = &source_text[method.span.start as usize..method.span.end as usize];
                                            let m_complexity = COMPLEXITY_RE.find_iter(m_snippet).count() as i32 + 1;

                                            symbols.push(SymbolResult {
                                                name: format!("{}.{}", id.name, method_id.name),
                                                line: m_start as u32,
                                                end_line: m_end as u32,
                                                is_exported: false,
                                                kind: "method".to_string(),
                                                complexity: m_complexity,
                                                lines: (m_end - m_start + 1) as i32,
                                            });
                                       }
                                   }
                               }
                           }
                       }
                   }
               },
               Statement::FunctionDeclaration(func) => {
                   if let Some(id) = &func.id {
                       let start_line = count_lines(&source_text[..func.span.start as usize]) + 1;
                       let end_line = count_lines(&source_text[..func.span.end as usize]);
                       let snippet = &source_text[func.span.start as usize..func.span.end as usize];
                       let complexity = COMPLEXITY_RE.find_iter(snippet).count() as i32 + 1;

                       symbols.push(SymbolResult {
                           name: id.name.to_string(),
                           line: start_line as u32,
                           end_line: end_line as u32,
                           is_exported: false,
                           kind: "function".to_string(),
                           complexity,
                           lines: (end_line - start_line + 1) as i32,
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

                           // We might only want variables initialized with functions/arrows to map existing behavior exactly
                           if declarator.init.as_ref().map_or(false, |init| matches!(init, oxc_ast::ast::Expression::ArrowFunctionExpression(_) | oxc_ast::ast::Expression::FunctionExpression(_))) {
                               symbols.push(SymbolResult {
                                   name: id.name.to_string(),
                                   line: start_line as u32,
                                   end_line: end_line as u32,
                                   is_exported: false,
                                   kind: "function".to_string(),
                                   complexity,
                                   lines: (end_line - start_line + 1) as i32,
                               });
                           }
                       }
                   }
               },
               Statement::ClassDeclaration(cls) => {
                   if let Some(id) = &cls.id {
                       let start_line = count_lines(&source_text[..cls.span.start as usize]) + 1;
                       let end_line = count_lines(&source_text[..cls.span.end as usize]);
                       
                       symbols.push(SymbolResult {
                           name: id.name.to_string(),
                           line: start_line as u32,
                           end_line: end_line as u32,
                           is_exported: false,
                           kind: "class".to_string(),
                           complexity: 1,
                           lines: (end_line - start_line + 1) as i32,
                       });

                       for el in &cls.body.body {
                           if let oxc_ast::ast::ClassElement::MethodDefinition(method) = el {
                               if let oxc_ast::ast::PropertyKey::StaticIdentifier(method_id) = &method.key {
                                   if method_id.name != "constructor" {
                                        let m_start = count_lines(&source_text[..method.span.start as usize]) + 1;
                                        let m_end = count_lines(&source_text[..method.span.end as usize]);
                                        let m_snippet = &source_text[method.span.start as usize..method.span.end as usize];
                                        let m_complexity = COMPLEXITY_RE.find_iter(m_snippet).count() as i32 + 1;

                                        symbols.push(SymbolResult {
                                            name: format!("{}.{}", id.name, method_id.name),
                                            line: m_start as u32,
                                            end_line: m_end as u32,
                                            is_exported: false,
                                            kind: "method".to_string(),
                                            complexity: m_complexity,
                                            lines: (m_end - m_start + 1) as i32,
                                        });
                                   }
                               }
                           }
                       }
                   }
               },
               _ => {}
           }
       }
    }
    
    symbols
}

pub fn count_lines(s: &str) -> usize {
    s.chars().filter(|&c| c == '\n').count()
}
