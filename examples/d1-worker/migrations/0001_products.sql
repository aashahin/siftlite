CREATE TABLE products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  tenant_id TEXT NOT NULL
);

INSERT INTO products (id, title, status, tenant_id) VALUES
  ('p1', 'sqlite search', 'active', 't1');
