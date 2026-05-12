## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [Short-circuit Async I/O]
**Learning:** Using `Promise.all` for a search task where we only need to find a single occurrence (like a specific keyword in a set of files) prevents short-circuiting. It initiates all async I/O operations simultaneously, wasting resources if the target is found early.
**Action:** Replace `Promise.all` with a `for...of` loop with an early `break` for search-and-short-circuit scenarios to optimize away unnecessary file reads.
