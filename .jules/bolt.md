## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [Async Short-Circuiting]
**Learning:** Using `Promise.all` with a `.map` array for concurrent file reads blocks true short-circuiting because all async I/O operations are initiated simultaneously before evaluation finishes. The original developer's intent of short-circuiting on `forwardRef` using `if (!hasForwardRef && existsSync(file))` evaluated to synchronously true for all instances mapped, causing unnecessary I/O.
**Action:** Replace nested `Promise.all` + `.map` with sequential `for...of` loops and a `break` statement when short-circuiting on discovery is intended.
