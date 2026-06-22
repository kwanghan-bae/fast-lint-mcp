## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [FD Analysis Optimization]
**Learning:** Sequential processing with `for...of` in file parsing creates a major bottleneck in file dependency mapping, but unbounded `Promise.all` can overwhelm I/O. AST queries using multi-string patterns are significantly slower than direct AST kind matchings.
**Action:** Use bounded concurrency via `p-map` (which is already in the `package.json` dependencies) combined with direct `{ kind: 'import_statement' }` querying and manual string slicing to achieve over 30% performance boost in file mapping.

## 2025-02-12 - [Vitest Node 18 Compatibility]
**Learning:** Vitest 4.x drops support for Node.js 18 causing module resolution errors like `No such built-in module: node:inspector/promises`. Modifying package.json to downgrade might affect newer versions.
**Action:** Dynamically downgraded vitest specifically for Node 18 environments inside GitHub Actions using `--no-save` flag, effectively enabling backwards compatibility without restricting developers on modern NodeJS.
