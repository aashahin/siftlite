# Search benchmarks

Local SQLite characterizations for Phase 12/14. These numbers are not D1 or
Turso Cloud evidence.

```bash
bun run bench:search          # 100k, writes local-100k.md
bun run bench:search:1m       # 1m, writes local-1m.md
bun run bench:d1              # remote D1 skip or reachability report
```

Reports:

- [local-100k.md](local-100k.md)
- [local-1m.md](local-1m.md)
- [d1-remote.md](d1-remote.md)
