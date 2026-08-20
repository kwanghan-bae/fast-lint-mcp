## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [Single-Pass AST Extraction with stack]
**Learning:** Using `@ast-grep/napi`, calling `node.findAll()` sequentially for nested structures (like finding complexity nodes inside symbol nodes) triggers repetitive C++/JS boundary crossings, leading to O(N*M) performance degradation.
**Action:** Combine all target node kinds into a single `root.findAll({ rule: { any: [...] } })` query. Track nesting and ancestry relationships entirely in JavaScript by maintaining a stack based on node interval boundaries (`node.range().start.index` and `node.range().end.index`), ensuring the AST is traversed only once and avoiding repeated FFI calls.
