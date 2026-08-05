## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [Combine AST Traversals & Field Extraction]
**Learning:** Calling `node.findAll()` sequentially inside a loop over matched nodes (e.g. to find complexity) is O(N*M) and repeatedly crosses the C++/JS boundary. Also, extracting parts of matches using string replacement or generic `node.find()` for identifiers is slow and error-prone compared to specific node tree matching.
**Action:** Combine target node kinds into a single `root.findAll({ any: [...] })` query, and resolve structural nesting in a single pass using a stack based on node interval ranges (`range.start.index` and `range.end.index`). Use `node.field('name')` directly or infer from `node.parent()` instead of querying the sub-tree.
