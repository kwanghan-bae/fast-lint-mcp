## 2025-02-27 - [@ast-grep/napi] AST Traversal Optimization
**Learning:** In the `@ast-grep/napi` library, checking for the existence of a pattern using `findAll(pattern).length > 0` causes an unnecessary full traversal of the AST and an O(N) array allocation overhead.
**Action:** Always use `find(pattern) !== null` for existence checks to short-circuit the AST traversal on the first match.
