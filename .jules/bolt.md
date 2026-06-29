## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.
## 2026-06-29 - [Extract String Instead of Patterns]
**Learning:** Using @ast-grep/napi with direct AST node kind matching (e.g., `kind: 'import_statement'`) and then extracting fields is much faster than passing multiple complex string patterns inside an `any` rule. It bypasses complex regex/state machine matching in favor of simple tree walks.
**Action:** Prefer `kind: '...' ` in AST searches over string patterns for robust and performant code.
