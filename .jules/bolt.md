## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [Optimize import statement source extraction]
**Learning:** Extracting parts of AST matches via string replacement patterns (e.g., `m.getMatch('VAR')`) when combined with multiple `any` string patterns is significantly slower than direct AST node kind matching (e.g., `{ kind: 'import_statement' }`) combined with extracting the AST node field (`m.field('source')`).
**Action:** Replace slow string-based pattern matching arrays with direct `{ kind: 'node_kind' }` matching and use `m.field('fieldName')` safely (with slice if needed for quotes) for faster AST traversal and extraction.
