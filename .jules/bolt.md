## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Query Optimization field extraction]
**Learning:** Extracting named fields (like the 'source' of an import statement) from @ast-grep/napi by first matching a string pattern (e.g. `import $A from '$B'`) and calling `m.getMatch('B')` is significantly slower than doing a direct AST node kind match (`{ kind: 'import_statement' }`) combined with `m.field('source')`.
**Action:** When extracting fields from AST nodes using @ast-grep, prefer matching the `kind` directly and then extracting specific nodes using `.field(name)` to save substantial parsing and traversal time. Note that fields often return the raw text (including quotes for strings), which must be manually sliced.
## 2025-02-13 - [Vitest and Node 18 CI Issue]
**Learning:** Vitest v4 uses `node:inspector/promises` which is a builtin module not present or not fully supported in Node.js 18. This causes the test suite to fail completely when running on Node 18 in GitHub Actions.
**Action:** When working with GitHub Actions workflows where Node 18 is part of the matrix, dynamically downgrade Vitest to `vitest@^2.1.8` and `@vitest/coverage-v8@^2.1.8` using `--no-save` specifically for Node 18.

## 2025-02-13 - [Vitest and Mock Restoration]
**Learning:** Using `vi.restoreAllMocks()` in an `afterEach` hook destroys the mock implementation established by `vi.mock()`, replacing it with `undefined`. This causes subsequent tests or other test files running in the same thread (or affected by module caching) to fail with `TypeError: Cannot read properties of undefined` when trying to call mocked methods.
**Action:** Always use `vi.clearAllMocks()` instead of `vi.restoreAllMocks()` in `afterEach` hooks if the intention is simply to reset call counts and mock results without destroying the mock functions themselves.
