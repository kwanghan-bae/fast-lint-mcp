## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-05-21 - [Async Early-Exit Optimization]
**Learning:** Using `Promise.all` for a search operation across multiple files starts all async I/O simultaneously. This prevents short-circuiting even if the target (like `forwardRef`) is found in the first file, resulting in wasted resources and unnecessary file reads.
**Action:** For async search-and-short-circuit scenarios, replace `Promise.all` mapping with a sequential `for...of` loop and use `break` to exit early when the condition is met.
