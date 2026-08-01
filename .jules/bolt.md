## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [AST Import Query Optimization]
**Learning:** Extracting string matches (`getMatch('VAR')`) from complex string patterns using multiple combinations of quotes for `import` statements in `@ast-grep/napi` is significantly slower than using the AST node kind `import_statement` and `.field('source')`.
**Action:** Replace complex string pattern queries for imports with `root.findAll({ rule: { kind: 'import_statement' } })` and use `m.field('source')` followed by manual string manipulation to strip quotes. This improves performance substantially.
