## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [AST Field Extraction]
**Learning:** Extracting matched sub-components using `m.getMatch('B')?.text()` from a complex multi-pattern `any` string rule in `@ast-grep/napi` is significantly slower than matching directly on the exact AST node kind (`import_statement`) and using `.field('source')`.
**Action:** Always prefer matching on specific AST node kinds and using `.field('fieldName')` to extract data rather than relying on string-based `$A` / `$B` variable captures. Remember that `.field('source')?.text()` retains the surrounding quotes, which must be stripped manually.
