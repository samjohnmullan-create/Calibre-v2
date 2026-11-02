-- Section 0.2 Foundation Health Baseline
--
-- Client-facing roles only need the explicit CRUD privileges granted by the
-- application migrations. TRUNCATE, TRIGGER and REFERENCES are not required
-- by the browser client and should never be inherited as a side-effect of
-- broad table grants.

revoke truncate, trigger, references
on all tables in schema public
from anon, authenticated;
