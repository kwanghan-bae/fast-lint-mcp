use syn::visit::Visit;
use syn::{
    ItemFn, ItemStruct, ItemEnum, ItemTrait, ItemImpl, ImplItemFn,
    ExprIf, ExprMatch, ExprForLoop, ExprWhile, ExprLoop,
};
use syn::spanned::Spanned;
use crate::SymbolResult;
use crate::parser::has_korean_comment_above;

struct ComplexityVisitor {
    pub complexity: i32,
}

impl ComplexityVisitor {
    fn new() -> Self {
        Self { complexity: 1 }
    }
}

impl<'ast> Visit<'ast> for ComplexityVisitor {
    fn visit_expr_if(&mut self, node: &'ast ExprIf) {
        self.complexity += 1;
        syn::visit::visit_expr_if(self, node);
    }
    fn visit_expr_match(&mut self, node: &'ast ExprMatch) {
        self.complexity += 1;
        syn::visit::visit_expr_match(self, node);
    }
    fn visit_expr_for_loop(&mut self, node: &'ast ExprForLoop) {
        self.complexity += 1;
        syn::visit::visit_expr_for_loop(self, node);
    }
    fn visit_expr_while(&mut self, node: &'ast ExprWhile) {
        self.complexity += 1;
        syn::visit::visit_expr_while(self, node);
    }
    fn visit_expr_loop(&mut self, node: &'ast ExprLoop) {
        self.complexity += 1;
        syn::visit::visit_expr_loop(self, node);
    }
}

pub struct SymbolVisitor<'a> {
    pub symbols: Vec<SymbolResult>,
    pub lines: &'a [&'a str],
}

impl<'a> SymbolVisitor<'a> {
    pub fn new(lines: &'a [&'a str]) -> Self {
        Self {
            symbols: Vec::new(),
            lines,
        }
    }

    fn check_korean_comment(&self, name: &str, line: u32) -> bool {
        crate::parser::is_trivial_symbol(name) || has_korean_comment_above(self.lines, line as usize, 5)
    }
}

impl<'ast, 'a> Visit<'ast> for SymbolVisitor<'a> {
    fn visit_item_fn(&mut self, node: &'ast ItemFn) {
        let name = node.sig.ident.to_string();
        let start_line = node.span().start().line as u32;
        let end_line = node.span().end().line as u32;
        let lines_count = (end_line.saturating_sub(start_line) + 1) as i32;
        
        let is_exported = matches!(node.vis, syn::Visibility::Public(_));
        let parameter_count = node.sig.inputs.len() as i32;
        
        let mut comp_visitor = ComplexityVisitor::new();
        comp_visitor.visit_item_fn(node);
        
        self.symbols.push(SymbolResult {
            name: name.clone(),
            line: start_line,
            end_line,
            is_exported,
            kind: "function".to_string(),
            complexity: comp_visitor.complexity,
            lines: lines_count,
            parameter_count,
            has_korean_comment: self.check_korean_comment(&name, start_line),
            local_identifiers: Vec::new(),
        });

        syn::visit::visit_item_fn(self, node);
    }

    fn visit_item_struct(&mut self, node: &'ast ItemStruct) {
        let name = node.ident.to_string();
        let start_line = node.span().start().line as u32;
        let end_line = node.span().end().line as u32;
        let lines_count = (end_line.saturating_sub(start_line) + 1) as i32;
        
        let is_exported = matches!(node.vis, syn::Visibility::Public(_));
        
        self.symbols.push(SymbolResult {
            name: name.clone(),
            line: start_line,
            end_line,
            is_exported,
            kind: "struct".to_string(),
            complexity: 1,
            lines: lines_count,
            parameter_count: 0,
            has_korean_comment: self.check_korean_comment(&name, start_line),
            local_identifiers: Vec::new(),
        });

        syn::visit::visit_item_struct(self, node);
    }

    fn visit_item_enum(&mut self, node: &'ast ItemEnum) {
        let name = node.ident.to_string();
        let start_line = node.span().start().line as u32;
        let end_line = node.span().end().line as u32;
        let lines_count = (end_line.saturating_sub(start_line) + 1) as i32;
        let is_exported = matches!(node.vis, syn::Visibility::Public(_));
        
        self.symbols.push(SymbolResult {
            name: name.clone(),
            line: start_line,
            end_line,
            is_exported,
            kind: "enum".to_string(),
            complexity: 1,
            lines: lines_count,
            parameter_count: 0,
            has_korean_comment: self.check_korean_comment(&name, start_line),
            local_identifiers: Vec::new(),
        });

        syn::visit::visit_item_enum(self, node);
    }

    fn visit_item_trait(&mut self, node: &'ast ItemTrait) {
        let name = node.ident.to_string();
        let start_line = node.span().start().line as u32;
        let end_line = node.span().end().line as u32;
        let lines_count = (end_line.saturating_sub(start_line) + 1) as i32;
        let is_exported = matches!(node.vis, syn::Visibility::Public(_));
        
        self.symbols.push(SymbolResult {
            name: name.clone(),
            line: start_line,
            end_line,
            is_exported,
            kind: "trait".to_string(),
            complexity: 1,
            lines: lines_count,
            parameter_count: 0,
            has_korean_comment: self.check_korean_comment(&name, start_line),
            local_identifiers: Vec::new(),
        });

        syn::visit::visit_item_trait(self, node);
    }

    fn visit_item_impl(&mut self, node: &'ast ItemImpl) {
        let _name = if let syn::Type::Path(type_path) = &*node.self_ty {
            if let Some(segment) = type_path.path.segments.last() {
                segment.ident.to_string()
            } else {
                "UnknownImpl".to_string()
            }
        } else {
            "UnknownImpl".to_string()
        };

        syn::visit::visit_item_impl(self, node);
    }

    fn visit_impl_item_fn(&mut self, node: &'ast ImplItemFn) {
        let name = node.sig.ident.to_string();
        let start_line = node.span().start().line as u32;
        let end_line = node.span().end().line as u32;
        let lines_count = (end_line.saturating_sub(start_line) + 1) as i32;
        
        let is_exported = matches!(node.vis, syn::Visibility::Public(_));
        let parameter_count = node.sig.inputs.len() as i32;
        
        let mut comp_visitor = ComplexityVisitor::new();
        comp_visitor.visit_impl_item_fn(node);
        
        self.symbols.push(SymbolResult {
            name: name.clone(),
            line: start_line,
            end_line,
            is_exported,
            kind: "method".to_string(),
            complexity: comp_visitor.complexity,
            lines: lines_count,
            parameter_count,
            has_korean_comment: self.check_korean_comment(&name, start_line),
            local_identifiers: Vec::new(),
        });

        syn::visit::visit_impl_item_fn(self, node);
    }
}

pub fn extract_symbols_syn(source_text: &str, file_path: &str) -> Vec<SymbolResult> {
    let _ = file_path;
    
    let lines_vec: Vec<&str> = source_text.lines().collect();
    
    let syntax_tree = match syn::parse_file(source_text) {
        Ok(tree) => tree,
        Err(_) => return Vec::new(),
    };

    let mut visitor = SymbolVisitor::new(&lines_vec);
    visitor.visit_file(&syntax_tree);

    visitor.symbols
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_symbols_syn_empty() {
        let result = extract_symbols_syn("", "test.rs");
        assert!(result.is_empty(), "빈 문자열 입력 시 빈 배열을 반환해야 합니다.");
    }

    #[test]
    fn test_extract_symbols_complexity() {
        let code = r#"
            // 한글 주석
            pub fn hello(a: i32, b: i32) -> i32 {
                if a > 0 {
                    match b {
                        1 => 1,
                        _ => 0,
                    }
                } else {
                    0
                }
            }
        "#;
        let result = extract_symbols_syn(code, "test.rs");
        assert_eq!(result.len(), 1);
        
        let sym = &result[0];
        assert_eq!(sym.name, "hello");
        assert_eq!(sym.is_exported, true);
        assert_eq!(sym.parameter_count, 2);
        assert_eq!(sym.complexity, 3); // 1(base) + 1(if) + 1(match) = 3
        assert_eq!(sym.has_korean_comment, true);
        assert!(sym.lines >= 9);
    }

    #[test]
    fn test_extract_struct_and_impl() {
        let code = r#"
            pub struct User {
                id: i32,
            }

            impl User {
                pub fn new() -> Self {
                    User { id: 1 }
                }
            }
        "#;
        let result = extract_symbols_syn(code, "test.rs");
        assert_eq!(result.len(), 2);
        
        let s_struct = result.iter().find(|s| s.kind == "struct").unwrap();
        assert_eq!(s_struct.name, "User");
        assert_eq!(s_struct.is_exported, true);

        let s_method = result.iter().find(|s| s.kind == "method").unwrap();
        assert_eq!(s_method.name, "new");
        assert_eq!(s_method.is_exported, true);
        assert_eq!(s_method.parameter_count, 0);
    }
}
