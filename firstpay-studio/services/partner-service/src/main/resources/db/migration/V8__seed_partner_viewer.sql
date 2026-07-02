-- Compte lecture seule documenté dans ROLES-MATRIX (absent de V2).

INSERT INTO partner_users (tenant_id, name, email, role, status, password_hash)
SELECT t.id, 'Sophie Mbarga', 's.mbarga@softtech.cm', 'partner_viewer', 'active', NULL
FROM tenants t
WHERE t.id = '11111111-1111-1111-1111-111111111111'::uuid
ON CONFLICT (tenant_id, email) DO NOTHING;
