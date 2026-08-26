## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [AST Node Name Extraction]
**Learning:** Using `node.find({ rule: { kind: 'identifier' } })` to extract a function/class name is inefficient because it traverses the entire subtree, and can incorrectly return internal variables.
**Action:** Use `node.field('name')` for direct O(1) access. If undefined (e.g. arrow functions), check the parent node (`node.parent()`) to infer the name from a `variable_declarator` (field: 'name') or `pair` (field: 'key').
