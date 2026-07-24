## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Node Field Extraction]
**Learning:** Extracting named fields via `.field('fieldName')` is much faster than string match variable extraction (like `m.getMatch('VAR')`) in `@ast-grep/napi`. Using `kind: 'import_statement'` combined with field extraction removes the overhead of complex regular expression-like string pattern rules.
**Action:** When extracting data from AST nodes like imports or exports, always use AST node kind matching and extract specific parts using `.field()` instead of relying on string replacement patterns.
