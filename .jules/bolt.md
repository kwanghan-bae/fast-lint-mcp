## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Symbol & Complexity Traversal Optimization]
**Learning:** In `ast-grep`, sequentially calling `node.findAll()` inside a loop of symbols is highly inefficient (O(N*M)) as it crosses the JS/C++ boundary and traverses the subtree repeatedly.
**Action:** Use a single `root.findAll({ any: [...symbolKinds, ...complexityKinds] })` traversal. Maintain a stack of active lexical scopes (based on node `range().start/end`) in JS, and when encountering a complexity node, increment the counter for all symbols in the stack. This single pass approach was measured to yield a >50% performance improvement (12.0s -> 4.9s in benchmarks) when calculating function complexities.
