## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Match Field Extraction Stability]
**Learning:** When benchmarking or testing `@ast-grep/napi` AST queries in tight loops in Node.js, reusing the same parsed AST root across many iterations can lead to segmentation faults during garbage collection.
**Action:** When writing scripts to benchmark `@ast-grep/napi` performance, re-parse the AST (e.g., `parse(Lang, code).root()`) inside the loop for each iteration to avoid segmentation faults.
