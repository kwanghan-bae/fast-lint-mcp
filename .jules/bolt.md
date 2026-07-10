## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Parsing Speed with Kinds]
**Learning:** In `@ast-grep/napi`, querying ASTs using direct node kinds (e.g., `{ kind: 'import_statement' }`) and extracting inner nodes with `.field('fieldName')` is significantly faster and more accurate than using multi-pattern regex-like string rules (`{ pattern: "import $A from '$B'" }`). Furthermore, it prevents segmentation faults that can happen if field constraints are placed inside nested rules instead of calling the `.field` method.
**Action:** Replace complex string pattern queries with direct `{ kind: '...' }` queries and manual extraction via `.field` where possible to optimize AST parsing.

## 2025-02-13 - [Optional Chaining for Saftey]
**Learning:** When depending on external environment checks or mocks (like `checkEnv()`), hardcoding property access (`res.pass`) can cause `TypeError: Cannot read properties of undefined` if the mock or external command fails to return an object.
**Action:** Use optional chaining (`res?.pass`) when accessing properties from external utility or mock functions to maintain stability.
