## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-23 - [AST Extraction Optimization]
**Learning:** Extracting named matches via string patterns in `@ast-grep/napi` (e.g. `import $A from '$B'`) and then `m.getMatch('B')` is ~15% slower than directly querying the AST node kind (e.g. `{ kind: 'import_statement' }`) and extracting the named field (`m.field('source')`).
**Action:** Always prefer AST node `kind` rules with `.field('fieldName')` extraction instead of complex string-based `pattern` matching when scanning a large number of nodes across the AST.
