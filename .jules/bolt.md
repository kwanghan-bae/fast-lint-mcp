## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [Optimize Dependency Map Creation]
**Learning:** In large monorepos, extracting imports from hundreds of files sequentially using `for...of` with `await` introduces significant I/O blocking. Additionally, using complex string matching rules in `ast-grep` is much slower than looking up AST nodes directly by their `kind`.
**Action:** Use concurrent batching (`p-map` or `Promise.all` with chunking) for file reading and processing, and replace `ast-grep` string rules with direct node kinds (e.g., `import_statement`) combined with `.field()` extraction for a 2x-5x speedup.
