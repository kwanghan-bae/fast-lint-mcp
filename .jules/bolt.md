## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [AST Extract Field Optimization]
**Learning:** Extracting named fields using @ast-grep/napi by utilizing string patterns with replace markers (e.g. `pattern: "import '$B'"` and `m.getMatch('B')`) can be significantly slower than directly querying the node kind and fetching the field (e.g. `rule: { kind: 'import_statement' }` and `m.field('source')`) - up to ~1.3-1.5x performance penalty in tight loops.
**Action:** Prefer `kind` matching and `m.field('fieldName')` over string template patterns (`pattern: "..."` + `getMatch()`) for straightforward field extraction tasks like resolving imports or finding function names.
