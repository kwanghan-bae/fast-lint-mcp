## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.
## 2025-02-12 - [Async Short-Circuit I/O Optimization]
**Learning:** Using `Promise.all` coupled with an internal state check (like `!hasFound`) to iterate over and asynchronously read files does not effectively short-circuit I/O operations. Since all promises are initiated simultaneously, the runtime will spawn all the file read operations before the first match can flip the internal state, wasting I/O resources and causing unneeded parsing.
**Action:** Replace `Promise.all` arrays over I/O bound queries in search operations with a sequential `for...of` loop combined with an early `break`. While slightly slowing down worst-case search scenarios, it prevents launching dozens of concurrent file reads on large arrays when only the first positive match is needed.
