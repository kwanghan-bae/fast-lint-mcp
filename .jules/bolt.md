## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [Optimize AST nested query]
**Learning:** Using `node.findAll()` on an AST node recursively traverses its subtree. Performing this inside an iteration over other nodes (e.g. `root.findAll({ rule: symbols }).forEach(node => node.findAll({ rule: complexity }))`) results in O(N*M) traversals crossing the JS/C++ boundary, which is extremely slow in `@ast-grep/napi`.
**Action:** Use a single, combined `.findAll({ any: [...] })` query to retrieve all required node kinds in one pass. Then, use a stack based on node interval boundaries (`node.range().start.index` and `node.range().end.index`) to resolve scopes and nested relationships entirely in JavaScript logic, keeping time complexity to O(N).
