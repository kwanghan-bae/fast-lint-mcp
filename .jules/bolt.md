## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Parsing Language Fallback]
**Learning:** The `AstCacheManager` currently parses all files that aren't strictly `.ts` or `.tsx` using `Lang.JavaScript` (or falls back to string patterns). This means Kotlin files (`.kt`) are parsed using a JavaScript grammar. Consequently, attempting to use Kotlin-specific AST node kind matching (e.g., `{ kind: 'class_declaration' }` or `{ kind: 'type_identifier' }`) will either fail or perform worse than direct string pattern matching because the AST structure does not match the actual language grammar.
**Action:** Do not attempt to optimize non-JS/TS fallbacks with specific AST node kinds unless the `AstCacheManager` is updated to instantiate the correct `@ast-grep/napi` `Lang` enum for those file types. Stick to string pattern matching for unsupported languages.
