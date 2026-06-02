## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST-Grep Extraction Optimization]
**Learning:** Extracting parts of matches using string replacement patterns in AST-Grep (like `root.findAll({ any: [{ pattern: "import $A from '$B'" }, ...] })` and `m.getMatch('B')`) is significantly slower than matching the node type directly (`{ kind: 'import_statement' }`) and extracting specific fields (like `m.field('source')`).
**Action:** Replace complex multi-pattern string rules with direct AST node kind matching when extracting named fields like the source of an import statement.
