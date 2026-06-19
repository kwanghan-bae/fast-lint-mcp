## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.
## $(date +%Y-%m-%d) - Sequential Loop Optimization in StructuralIntegrity
**Learning:** In async search-and-short-circuit scenarios (like checking multiple files for a pattern to exit early), using unbounded `Promise.all` triggers all read operations simultaneously, negating the benefit of an early return. Using `p-map` combined with a sequential `for...of` loop inside each task batch allows for true short-circuiting, saving I/O overhead without exhausting resources. Also, running `npm install` to fix transient `npx` errors permanently modifies `package.json`, which violates strict constraints; use `git restore` to revert such unwanted side effects.
**Action:** When short-circuiting is the goal across a large array of files, prefer bounded concurrency (e.g., `p-map`) wrapped around sequential loops (`for...of` with `break`) instead of raw `Promise.all`.
