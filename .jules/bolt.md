## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [Optimize AST node name extraction]
**Learning:** When querying function or class nodes with `@ast-grep/napi`, using `node.find({ rule: { kind: 'identifier' } })` to get the name is inefficient because it searches the entire subtree. Furthermore, it incorrectly returns internal variables for anonymous functions (e.g. returns 'y' in `() => { let y = 2 }`).
**Action:** Use `node.field('name')` instead to accurately and safely retrieve the declaration's name in O(1) time without full subtree traversal.
