# Security Policy

## Reporting a vulnerability

Please report security issues privately. Do not open a public GitHub issue for
vulnerabilities that could enable SQL injection, query-language injection,
tenant leakage, or data exposure.

Preferred contact: open a private security advisory on the GitHub repository.

Include:

- affected package and version;
- reproduction steps that do not require production credentials;
- impact (injection, isolation bypass, data remanence, denial of service).

## Product security boundaries

SiftLite processes attacker-controlled search text and filter values.

The implementation must preserve these rules:

- every SQL value is a bind parameter;
- request input never becomes a SQL identifier, raw SQL, or backend query grammar;
- ordinary `.search(text)` is parsed into a portable AST;
- raw backend syntax is a separate, explicitly unsafe API;
- numeric source IDs are finite safe integers only;
- shared-database tenant scopes are compiler-owned and cannot be removed by user filters;
- normal delete means search invisibility, not forensic erasure from backups or replicas;
- logs and diagnostics must not include bound values or raw query text by default.

Highlighted/formatted fields are not sanitized HTML. Treat them as untrusted text.
