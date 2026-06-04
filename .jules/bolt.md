## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Extraction Patterns]
**Learning:** When extracting named fields using @ast-grep/napi, extracting parts of matches via string replacement patterns (e.g., `m.getMatch('VAR')`) is significantly slower than direct AST node kind matching (e.g., `{ kind: 'import_statement' }`) combined with `m.field('fieldName')`.
**Action:** Use `{ kind: '...' }` combined with `m.field('...')` to achieve faster matching.

## 2025-02-13 - [Kotlin AST Node Kinds]
**Learning:** In the tree-sitter Kotlin grammar used by @ast-grep/napi, class names within a `class_declaration` are represented by the `type_identifier` node kind, not `identifier`. Using `identifier` will result in missing nodes and regressions.
**Action:** Always verify tree-sitter specific grammar structures when replacing string patterns with AST kinds.
