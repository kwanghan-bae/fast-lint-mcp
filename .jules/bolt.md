## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.
## 2024-05-19 - AST-Grep Query Optimization

**Learning:** When querying the AST using `@ast-grep/napi` for simple syntactic constructs (like `import` statements), relying on deeply nested strings inside `any` patterns is surprisingly slow due to the overhead of string rule matching. Using a direct AST Node Type match (`rule: { kind: 'import_statement' }`) skips the complex pattern engine and evaluates instantly against the underlying tree.
**Action:** Always prefer direct `{ kind: 'NodeKind' }` matching over `{ pattern: 'string' }` whenever structurally feasible, specifically for operations executed thousands of times across the dependency map.

## 2024-05-19 - Promise.all vs Sequential Loops in AST Dependency Tree Parsing

**Learning:** `extractImportsFromFile` performs asynchronous disk I/O (`fs.promises.readFile`) and executes heavy native binding parsing per file. Iterating through the entire file list with a sequential `for...of` loop creates an I/O bottleneck. Converting this to a `Promise.all` model with chunking (e.g., 50 files) vastly improves throughput as the Node.js event loop seamlessly schedules disk I/O concurrently.
**Action:** When extracting mapping definitions or building AST trees across a large volume of files, always default to a chunked concurrency model.
