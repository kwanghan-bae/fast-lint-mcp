## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2024-05-30 - [AstGrep Query Optimization]
**Learning:** When using @ast-grep/napi, passing a structured rule object (e.g., `root.findAll({ rule: { pattern: '...' } })`) or directly traversing AST node kinds (e.g., `root.findAll({ rule: { kind: 'import_statement' } })`) is significantly faster than using string-based multi-pattern matching or direct string arguments.
**Action:** Always prefer structured rule objects and direct AST kind queries over shorthand string patterns for ast-grep queries.
