## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-05-20 - [Short-circuit Async I/O]
**Learning:** For async search-and-short-circuit scenarios (like checking for 'forwardRef' in a cycle of files), using `Promise.all` executes all async I/O operations simultaneously, preventing true short-circuiting and wasting resources.
**Action:** Use a sequential `for...of` loop with an early `break` rather than `Promise.all` to save I/O resources and speed up execution.
