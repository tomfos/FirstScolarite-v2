-- Répare les comptes démo documentés qui ne se connectent pas avec le mot de passe « demo ».
--
-- Règle backend (AuthController) :
--   password_hash IS NULL  → mot de passe accepté : demo
--   password_hash présent  → vérification BCrypt uniquement
--
-- Usage (sur le serveur, depuis firstpay-studio/) :
--   docker compose -p firstpay-studio exec -T postgres \
--     psql -U firstpay -d firstpay -f - < infrastructure/scripts/sql/fix-demo-users.sql
--
-- Ou : sudo ./infrastructure/scripts/fix-demo-users.sh

BEGIN;

-- 1) Admin banque : réinitialiser sur le mode démo (demo)
UPDATE partner_users
SET password_hash = NULL,
    status = 'active',
    role = 'bank_admin'
WHERE lower(email) = lower('admin.banque@afrilandfirstbank.com');

-- Créer le compte s'il a été supprimé (tenant banque V5)
INSERT INTO partner_users (tenant_id, name, email, role, status, password_hash)
SELECT t.id, 'Cécile Mvondo', 'admin.banque@afrilandfirstbank.com', 'bank_admin', 'active', NULL
FROM tenants t
WHERE t.id = '00000000-0000-0000-0000-000000000001'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM partner_users u
    WHERE lower(u.email) = lower('admin.banque@afrilandfirstbank.com')
  );

-- 2) Sophie Mbarga (partner_viewer) — absente du seed V2, présente dans la doc
INSERT INTO partner_users (tenant_id, name, email, role, status, password_hash)
SELECT t.id, 'Sophie Mbarga', 's.mbarga@softtech.cm', 'partner_viewer', 'active', NULL
FROM tenants t
WHERE t.id = '11111111-1111-1111-1111-111111111111'::uuid
ON CONFLICT (tenant_id, email) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  status = 'active',
  password_hash = NULL;

-- 3) Sécurité : garantir demo pour tous les comptes documentés dans ROLES-MATRIX
UPDATE partner_users
SET password_hash = NULL, status = 'active'
WHERE lower(email) IN (
  lower('jospinleunou@softtech.cm'),
  lower('marie.ngono@softtech.cm'),
  lower('d.essomba@softtech.cm'),
  lower('s.mbarga@softtech.cm'),
  lower('admin.banque@afrilandfirstbank.com'),
  lower('caisse.bonanjo@afrilandfirstbank.com')
);

COMMIT;

-- Contrôle
SELECT email, role, status,
       CASE WHEN password_hash IS NULL THEN 'demo' ELSE 'hash (mot de passe personnalisé)' END AS login_mode
FROM partner_users
WHERE lower(email) IN (
  lower('jospinleunou@softtech.cm'),
  lower('marie.ngono@softtech.cm'),
  lower('d.essomba@softtech.cm'),
  lower('s.mbarga@softtech.cm'),
  lower('admin.banque@afrilandfirstbank.com'),
  lower('caisse.bonanjo@afrilandfirstbank.com')
)
ORDER BY email;
