## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.
## 2023-11-20 - [Short-circuiting async I/O in arrays]
**Learning:** Promise.all combined with map executes synchronously up to the first await and prevents true early exiting or short-circuiting in async evaluations, which may lead to concurrent and unnecessary file I/O operations that degrade performance.
**Action:** Replace Promise.all with sequential for...of loops and a conditional break statement for short-circuiting in search scenarios to ensure we don't perform unnecessary async operations.
