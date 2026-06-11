## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Extraction Optimization]
**Learning:** Extracting named fields from `ast-grep` matches via `.getMatch('VAR')` against complex string patterns (especially `any` rules with multiple syntax variants) is significantly slower (up to 4-5x) compared to a direct AST node kind query (`{ kind: 'import_statement' }`) and traversing structural fields (`m.field('source')`).
**Action:** Replace high-level regex-style multi-pattern rules with direct AST node kind matching wherever structural data (like import targets, class names) needs to be extracted en masse. Manually post-process strings (like stripping quotes) instead of relying on the AST matcher to do it.
