use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_ast::ast::{Statement, Declaration};
use crate::SymbolResult;

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
                           symbols.push(SymbolResult {
                               name: id.name.to_string(),
                               line: 1, // TODO: map span to line
                               end_line: 1,
                               is_exported: true,
                               kind: "function".to_string(),
                               complexity: 1,
                               lines: 1,
                           });
                       }
                   }
                   // TODO: Handle other declarations like Class, Variable
               },
               Statement::FunctionDeclaration(func) => {
                   if let Some(id) = &func.id {
                       symbols.push(SymbolResult {
                           name: id.name.to_string(),
                           line: 1,
                           end_line: 1,
                           is_exported: false,
                           kind: "function".to_string(),
                           complexity: 1,
                           lines: 1,
                       });
                   }
               },
               // TODO: Handle ClassDeclaration, VariableDeclaration
               _ => {}
           }
       }
    }
    
    symbols
}
