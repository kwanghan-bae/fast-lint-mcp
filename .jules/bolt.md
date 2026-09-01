## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [AST Field Extraction vs String Pattern]
**Learning:** When using `@ast-grep/napi` to extract parts of a statement (like the import source), using direct node kind matching (e.g., `{ kind: 'import_statement' }`) and extracting the named field (`m.field('source')`) is significantly faster (around 2x) than using string replacement patterns (e.g., `{ pattern: "import $A from '$B'" }`) and getting the match (`m.getMatch('B')`). It also simplifies handling variations like single vs double quotes.
**Action:** Prefer direct AST node kind matching and named fields extraction (`m.field('fieldName')`) over string patterns when querying parts of a statement in `@ast-grep/napi`. Note that node fields include original quotes, so they must be manually stripped if needed.

## 2025-02-12 - [Concurrent Cross-File Execution]
**Learning:** Using `Promise.all` for unbounded parallel execution of cross-file async operations (like parsing multiple AST files) can exhaust system resources or block the Node event loop if I/O is slow. A sequential `for...of` loop is safe but slow.
**Action:** Use `p-map` (e.g., `pMap(files, async (f) => {}, { concurrency: 50 })`) to balance concurrent execution speed while preventing resource exhaustion during bulk operations.
