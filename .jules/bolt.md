## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.
## 2025-02-12 - [Combine AST Traversals with Stack for Complexity]
**Learning:** Calling `node.findAll()` sequentially inside a loop over matched nodes (e.g., iterating through symbols to find their complexity) is highly inefficient (O(N*M)) as it repeatedly crosses the JS/C++ boundary.
**Action:** Optimize this by combining target node kinds into a single `root.findAll({ any: [...] })` query, and resolving structural relationships (like nesting) in a single pass using a stack based on node interval ranges (`range.start.index` and `range.end.index`).

## 2025-02-12 - [AST Node Name Extraction Optimization]
**Learning:** When querying function or class nodes with @ast-grep/napi, avoid using `node.find({ rule: { kind: 'identifier' } })` to get the name, as it searches the entire subtree and incorrectly returns internal variables. Use `node.field('name')` instead.
**Action:** Use `node.field('name')`. If this returns null/undefined (e.g., for arrow functions or function expressions), inspect `node.parent()` to infer the name from a `variable_declarator` (field: 'name') or `pair` (field: 'key').
