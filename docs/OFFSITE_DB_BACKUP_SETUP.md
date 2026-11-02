# Calibre off-site database backup setup

Status: **Foundation 0.2.2c — manual proof required before scheduling**

Calibre's production Supabase organisation is currently on the Free plan. Supabase recommends Free projects regularly export their database with `supabase db dump` and retain copies off-site. This workflow stores an **encrypted** recovery artifact in GitHub Actions, which is separate from the production Supabase project.

The workflow is intentionally manual until one complete backup has been downloaded, decrypted and restore-tested. Do not add a schedule merely because the workflow runs once.

## What the workflow captures

The recovery set follows Supabase's current CLI backup/restore guidance:

- `roles.sql`
- `schema.sql`
- `data.sql`
- `history_schema.sql` for `supabase_migrations`
- `history_data.sql` for `supabase_migrations`
- SHA-256 checksums for every plaintext dump component
- a recovery manifest containing the source Git commit and generation time

The plaintext set is compressed, encrypted with AES-256-GCM using a scrypt-derived key, then deleted from the GitHub runner. Only the encrypted `.calibrebackup` file and non-sensitive metadata are uploaded as the GitHub Actions artifact.

**Storage binaries are not included.** They remain a separate Calibre Storage archive/recovery layer.

## Required GitHub secrets

The connected ChatGPT GitHub integration cannot create or read GitHub Actions secrets. These must be configured deliberately in GitHub before the first real run.

Repository → **Settings → Secrets and variables → Actions → New repository secret**

### `CALIBRE_BACKUP_DB_URL`

Preferred setup: use Supabase **temporary/JIT database access** rather than putting the long-lived production database password into GitHub.

1. In Supabase, open the Calibre v2 project → **Database settings → Temporary access**.
2. Enable temporary access.
3. Authorize the account/token used for backup to assume the `postgres` role.
4. Prefer a scoped Supabase Personal Access Token with an expiry appropriate for the backup process.
5. From **Connect**, use the **Session pooler** connection string. Supabase recommends the session pooler for environments such as GitHub-hosted runners.
6. Use the temporary-access token as the database password and enable JIT in the connection options. Store the complete resulting connection URI as the GitHub secret `CALIBRE_BACKUP_DB_URL`.

Supabase's temporary-access documentation shows the session-pooler form with `options=-c jit=on`; when encoded in a URI the query component is typically `?options=-c%20jit%3don`.

Fallback: a normal database-password connection URI will also work, but it is a long-lived production credential and is not the preferred design.

Never put either connection URI into the repository, an issue, a PR comment or a workflow input.

### `CALIBRE_BACKUP_PASSPHRASE`

Use a unique random passphrase of at least 24 characters; 32+ random characters is preferred.

Store the same passphrase somewhere **outside GitHub** that would still be available if the GitHub account were inaccessible, for example a trusted password manager plus an offline recovery record.

If the passphrase is lost, the encrypted database artifact is deliberately unrecoverable.

## First manual backup

After both secrets exist:

1. Open GitHub → **Actions**.
2. Select **Manual encrypted Calibre DB backup**.
3. Choose **Run workflow** on `main`.
4. The job must pass all dump, validation, encryption and upload steps.
5. Download the resulting artifact immediately for the first acceptance run.

The workflow keeps GitHub artifacts for 30 days. That retention is a convenience, not the final recovery policy.

## Verify and decrypt a downloaded artifact

The artifact contains:

- `calibre-db-backup-<timestamp>.calibrebackup`
- `calibre-db-backup-<timestamp>.metadata.json`

First compare the encrypted file's SHA-256 digest with `encrypted_sha256` in the metadata.

Then, from a trusted machine with Node.js:

```bash
export CALIBRE_BACKUP_PASSPHRASE='your recovery passphrase'
node scripts/calibre-db-backup-crypto.mjs decrypt \
  calibre-db-backup-<timestamp>.calibrebackup \
  calibre-db-backup-restored.tar.gz
```

Extract the archive:

```bash
tar -xzf calibre-db-backup-restored.tar.gz
```

Verify every plaintext dump component before any restore attempt:

```bash
sha256sum -c plaintext-checksums.sha256
```

All checks must report `OK`.

Do not commit, upload to an issue, or otherwise publish the decrypted SQL files. They contain production business data and may contain authentication data.

## Restore drill gate

A successful encrypted backup job is **not yet recovery acceptance**.

Before Section 0.2 can pass, restore the recovery set into a disposable non-production target and reconcile at minimum:

- public/workspace table counts,
- Auth user count where applicable,
- migration history,
- critical finance totals,
- Item/Work counts,
- audit history,
- and the separate Storage archive/checksums.

Never restore this set over production as a test.

## Important recovery limitations

Database backup does not by itself preserve everything needed to recreate the hosted service:

- Supabase Storage binary objects are separate.
- API/JWT secrets and provider settings require reconfiguration.
- custom role passwords are not portable in normal backups.
- Edge Function source is protected through Git, not this database artifact.
- DNS/custom-domain configuration is outside the database.

The Calibre recovery model therefore remains layered: Git + database recovery set + structured owner export + Storage binary archive + a proven restore drill.
