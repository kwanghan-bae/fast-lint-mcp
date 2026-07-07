## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Extraction Optimization]
**Learning:** Extracting named fields from AST matches using `m.getMatch('VAR')?.text()` with string pattern matching rules like `import $A from '$B'` in `@ast-grep/napi` is significantly slower than using direct AST node kind matching (e.g., `{ kind: 'import_statement' }`) and extracting fields directly via `m.field('fieldName')?.text()`. The latter method avoids complex pattern compilation and traversal overhead. However, when extracting string literals using `.field()`, the surrounding quotes are included and must be manually stripped (e.g. `.slice(1, -1)`).
**Action:** When extracting data from ASTs, prefer using `{ kind: 'node_kind' }` rules over string patterns, and use `.field('fieldName')` to extract required components.
