## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [Sync File I/O Concurrency]
**Learning:** Wrapping synchronous CPU-bound operations or synchronous file reads (like `AstCacheManager.getInstance().getRootNode(filePath)`) inside a concurrency wrapper like `p-map` or `Promise.all` adds overhead without providing true concurrency. It blocks the Node.js event loop and can cause other async operations (like test runners) to timeout.
**Action:** Use standard sequential iteration (`for...of`) for synchronous operations in Node.js instead of forcing them into artificial Promises.
