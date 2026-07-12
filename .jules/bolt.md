## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [AST Query Optimization: Field Extraction vs Match Pattern]
**Learning:** When trying to extract a specific part of a statement (like the source path of an import), using complex multi-pattern string rules and `m.getMatch('B')` is significantly slower (approx 4x slower) than using direct AST node kind matching (`{ kind: 'import_statement' }`) and extracting the named field via `m.field('source')`. The string pattern parser has high overhead for evaluating multiple OR conditions (`any: [...]`).
**Action:** Always prefer direct `kind` queries for standard language constructs (imports, exports, functions) and use `.field()` to extract components.
