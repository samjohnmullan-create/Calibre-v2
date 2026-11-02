-- Section 0.2 Foundation Health Baseline
--
-- Client-facing roles only need the explicit CRUD privileges granted by the
-- application migrations. TRUNCATE, TRIGGER, REFERENCES and MAINTAIN are not
-- required by the browser client and should not be inherited as a side-effect
-- of broad/default table grants.

revoke truncate, trigger, references, maintain
on all tables in schema public
from anon, authenticated;

-- Calibre migrations create application tables as the postgres migration role.
-- Remove the same privileges from its public-schema defaults so future tables
-- do not silently reintroduce the drift. Supabase-managed role defaults are
-- intentionally left untouched.
alter default privileges for role postgres in schema public
revoke truncate, trigger, references, maintain on tables from anon, authenticated;
