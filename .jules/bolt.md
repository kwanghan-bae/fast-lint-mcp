## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [Combine AST Traversals for nested nodes]
**Learning:** Calling `node.findAll()` sequentially inside a loop over matched nodes (e.g., iterating through symbols to find their complexity) is highly inefficient (O(N*M)) as it repeatedly crosses the JS/C++ boundary.
**Action:** Combine target node kinds into a single `root.findAll({ rule: { any: [...] } })` query, and resolve structural relationships in a single pass using a stack based on node interval ranges (`range.start.index` and `range.end.index`). Note that tree-sitter interval ranges are exclusive at the end, so when popping from the stack for adjacent sibling symbols you must use `<=` instead of `<` to handle exact boundary overlaps.
