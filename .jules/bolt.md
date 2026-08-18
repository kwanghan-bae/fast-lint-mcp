## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [Combine Sequential AST Lookups]
**Learning:** Calling `node.findAll()` sequentially inside a loop over matched AST nodes (e.g. iterating over symbol matches and running `node.findAll` on each to count complexity) causes severe performance degradation (O(N*M)) due to repeated JS/C++ boundary crossings.
**Action:** Combine the target node kinds into a single `root.findAll({ rule: { any: [...] } })` query, and use a stack tracking node interval ranges (`range.start.index` and `range.end.index`) to resolve structural parent-child relationships in a single pass.
