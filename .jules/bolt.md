## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [AST Pattern Query Optimization]
**Learning:** Using complex string replacement patterns with `$A` and `$B` in `@ast-grep/napi` queries (e.g., `import $A from '$B'`) causes significant performance overhead. Extracting match values via `.getMatch('VAR')` is much slower than fetching a structural field.
**Action:** Use direct AST node kind matching (e.g., `{ kind: 'import_statement' }`) and extract named fields (like `node.field('source')`) directly to reduce AST traversal time and string matching overhead.
