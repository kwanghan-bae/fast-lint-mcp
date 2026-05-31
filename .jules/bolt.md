## 2024-05-31 - AST-grep string pattern matching vs kind matching overhead
**Learning:** When extracting nodes like `import_statement` using `@ast-grep/napi`, using complex string pattern matching (`{ pattern: "import $A from '$B'" }`) involves significantly more overhead parsing the pattern than direct AST node kind matching (`{ kind: 'import_statement' }`). Using `.field('source')` directly on the matched node is ~4x faster than `.getMatch('B')` for retrieving string literals.
**Action:** When querying for structured AST node kinds (e.g., imports, classes), prioritize `{ kind: 'node_type' }` and `node.field('field_name')` over wildcard string patterns for faster traversal speed.

## 2024-05-31 - AST-grep string pattern matching vs kind matching overhead
**Learning:** When extracting nodes like `import_statement` using `@ast-grep/napi`, using complex string pattern matching (`{ pattern: "import $A from '$B'" }`) involves significantly more overhead parsing the pattern than direct AST node kind matching (`{ kind: 'import_statement' }`). Using `.field('source')` directly on the matched node is ~4x faster than `.getMatch('B')` for retrieving string literals.
**Action:** When querying for structured AST node kinds (e.g., imports, classes), prioritize `{ kind: 'node_type' }` and `node.field('field_name')` over wildcard string patterns for faster traversal speed.
