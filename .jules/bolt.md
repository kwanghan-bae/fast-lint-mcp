## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [Single Pass Structural AST Evaluation]
**Learning:** Calling `node.findAll` sequentially on every symbol to find its complexity takes O(M*N) time as it continually crosses the C++/JS bridge for every symbol subtree. Additionally, `node.find({ rule: { kind: 'identifier' } })` incorrectly extracts variables within methods rather than the method name itself.
**Action:** Combine target node kinds into a single `root.findAll({ any: [...] })` query. Resolve structural relationships (like nesting) in a single pass using an interval stack based on `node.range()`. Extract symbol names accurately using `node.field('name')` or inferring them from the parent's `variable_declarator` or `pair`.
