## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2024-05-18 - Promise.all prevents true async short-circuiting
**Learning:** In async iteration, `Promise.all` with `map` starts all concurrent requests simultaneously. Checking a boolean condition like `if (!hasForwardRef)` within the callback will NOT prevent subsequent operations from starting because all the initial callbacks are evaluated synchronously before the first `await` resolves.
**Action:** When searching for a single positive match in I/O operations (like reading a file that contains a specific string), use a sequential `for...of` loop with an early `break` to correctly short-circuit and avoid unnecessary file reads.
