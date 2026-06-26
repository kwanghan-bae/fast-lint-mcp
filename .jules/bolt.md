## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [AST String Query Optimization]
**Learning:** Using `@ast-grep/napi` to evaluate a complex rule containing multiple string interpolation patterns (e.g. `pattern: "import $A from '$B'"`) is computationally heavier than matching AST node types directly (`kind: 'import_statement'`) and using field extractors (e.g., `m.field('source')`). Testing showed approximately ~70% reduction in processing time for extraction tasks.
**Action:** When extracting data from AST nodes (like imports or exports), query directly by node `kind` and extract via `.field('fieldName')` instead of using complex `any` and `pattern` arrays.
