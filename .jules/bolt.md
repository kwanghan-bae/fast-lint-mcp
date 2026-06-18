## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [Async I/O optimization for short-circuit checks]
**Learning:** When checking a condition across an array of files (e.g. looking for `forwardRef` in circular dependencies), using concurrent wrappers like `p-map` or `Promise.all` triggers read operations for all files simultaneously before short-circuiting.
**Action:** Use a sequential `for...of` loop with an early `break` for the inner search, ensuring that no unnecessary files are read after the condition is met, combined with an outer concurrent batch map (e.g., `p-map`) to process independent groupings (like cycles) efficiently.
