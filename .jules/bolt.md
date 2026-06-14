## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Match Field Extraction Optimization]
**Learning:** When using `@ast-grep/napi` to find specific nodes like `import_statement`s, replacing a heavy string pattern regex matching on `$B` (e.g. `import $A from '$B'`) with a simple AST node type match (`{ kind: 'import_statement' }`) combined with `.field('source')` is significantly faster (approx. 3x faster in local tests). The `.field('source').text()` method will return the quotes, so they must be sliced off (`.slice(1, -1)`).
**Action:** Prefer direct AST `kind` property queries with `.field()` accessors for structural extraction instead of string template pattern matching when dealing with structured AST nodes.
