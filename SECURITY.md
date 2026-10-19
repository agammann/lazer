# Security

Run `npm run security:audit` after dependency changes. CI requires zero dependency advisories.

## Bounded brace tooling

Transitive `braces` imports resolve to the repository-maintained
`@agammann/bounded-braces` package in `vendor/bounded-braces`. It preserves the
upstream MIT license and ordinary glob behavior, while rejecting excessive
brace/parenthesis nesting and cyclic direct AST values before stack exhaustion.
The 64-level safety bound cannot be disabled by caller options. The package
README documents its origin and maintenance requirements. The regular test
command verifies real tooling dependency edges and adversarial inputs.
