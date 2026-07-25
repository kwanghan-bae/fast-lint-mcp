## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-23 - [AST Field Extraction vs String Match Replacement]
**Learning:** When extracting named fields using `@ast-grep/napi`, querying with direct AST node kind matching (e.g., `{ kind: 'import_statement' }`) and extracting the field with `m.field('fieldName')` is significantly faster (approx. 2x-3x) than using multi-pattern string rules and extracting parts of the match via string replacement patterns (e.g., `m.getMatch('VAR')`).
**Action:** Use `.field('fieldName')` combined with direct node kind queries to extract specific parts of nodes instead of complex string patterns with match variables. Note that `.text()` on field nodes might return quotes which need to be stripped manually (e.g., using `slice(1, -1)`).
