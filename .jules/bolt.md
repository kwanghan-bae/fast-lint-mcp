## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2026-05-15 - [Short-circuit Async I/O Search]
**Learning:** Using `Promise.all` for a search task where only a single occurrence is needed (e.g. searching files for a keyword) prevents short-circuiting. All async I/O is initiated concurrently, so a `hasFound` flag check inside each callback only avoids the post-read work — not the read itself.
**Action:** For search-and-short-circuit scenarios, use `for...of` with an early `break` rather than `Promise.all`. Genuine I/O elimination outweighs the loss of parallelism within the small set being searched.
