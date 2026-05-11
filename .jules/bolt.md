## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.
## 2025-02-12 - [AST Queries and Promise Iteration Overheads]
**Learning:** Promise.all for iterating through arrays and doing async tasks (like file I/O) negates short-circuit logic because all promises are executed immediately regardless of early results. Furthermore, checking multiple complex string patterns (like "$A from '$B'") with @ast-grep/napi is roughly 20-30% slower than matching by `{ kind }` and extracting subnodes.
**Action:** Use `for...of` loops with `break` when async short-circuiting is needed. Use explicit `{ kind }` queries rather than string match rules when performing frequent AST lookups.
