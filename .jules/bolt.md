## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.
## 2025-02-12 - [AST Query Optimization]
**Learning:** For extracting information like imports from ASTs in `@ast-grep/napi`, relying on complex string pattern rules (e.g. `{ pattern: "import $A from '$B'" }`) is slower and prone to edge cases (like escaping, dynamic imports).
**Action:** Use direct node kind matching like `{ kind: 'import_statement' }` and extract fields using `.field('source')` for better performance and structural correctness.
