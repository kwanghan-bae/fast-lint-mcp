## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Parsing Field Extraction Optimization]
**Learning:** When using `@ast-grep/napi` to extract named fields (like the `source` of an import statement), doing a `.getMatch()` with a string pattern variable (e.g. `import $A from '$B'`) is significantly slower than using an exact AST node kind match (`{ kind: 'import_statement' }`) combined with `.field('source')`.
**Action:** Replace complex multi-pattern string rules with a single AST node kind match where possible, and extract child nodes using `.field(name)`.
