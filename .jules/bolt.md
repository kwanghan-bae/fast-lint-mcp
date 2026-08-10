## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [AST Named Fields vs String Replacement]
**Learning:** When using `@ast-grep/napi`, extracting parts of matches via string replacement patterns (e.g., `import $A from '$B'` combined with `m.getMatch('B')`) is significantly slower than using direct AST node kind matching (e.g., `{ kind: 'import_statement' }`) and accessing named fields (e.g., `m.field('source')`).
**Action:** Use AST node kind matching and `.field()` instead of complex multi-string pattern rules for extracting data from AST nodes.
