## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Optimization Constraint]
**Learning:** Optimizing AST queries using `ast-grep` by changing string patterns to `kind` matching is a significant performance boost (3x+ improvement). However, care must be taken to only match the original nodes targeted by the string patterns. Adding `{ kind: 'export_statement' }` to a query designed only to extract `imports` is a functional regression/behavioral change.
**Action:** When converting regex-like string matchers to AST node kinds, strictly maintain the exact bounds of the original search.
