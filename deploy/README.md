# M016 · Production preparation (not a production deployment)

Node website + PostgreSQL on one Linux host; private Alibaba OSS and a separate backup bucket; TLS transactional SMTP. No Logto or real payments. Local PGlite, QQ preview and existing files remain unchanged. Production artifacts do not contain .env files, user data or development databases.

## Prerequisites and purchasing

Use company-owned domain/cloud accounts. See [procurement](PROCUREMENT.md) for quote fields and [release gates](RELEASE-GATES.md). Candidate Hong Kong region must be tested from mainland and intended overseas locations before a long commitment. 4 vCPU/8GiB/100GiB is a test baseline, NOT certification of 300 concurrent users. Single host has no automatic failover.

Install Docker Engine + Compose v2 on a maintained Linux host. Confirm image availability and security scan the fixed Node/PostgreSQL/Caddy versions before promotion. Keep SSH key-only and IP-restricted. Expose 80/443 only; never publish PostgreSQL or the application port. Docker-published ports must be restricted at the cloud security group too. Corporate maintainers own these tasks.

## Isolated first deployment

1. Review/merge the source PR and freeze its Git SHA. From a clean checkout copy `deploy/.env.example` to `deploy/.env` privately (never overwrite an existing file). Generate each 64-hex secret independently. Passwords with `$` must use literal single quotes in Compose .env. Set domain/DNS, authenticated SMTP sender, private OSS/backup buckets and scoped credentials. Set `RELEASE_ID` to the frozen SHA.
2. Configure bucket-level block-public-access and versioning. Application RAM identity needs GetObject/PutObject/ListObjects only on the configured asset prefix; forbid public ACL. Backup identity is separate and needs backup bucket GetObject/PutObject/ListObjects. No application deletion permission is required. Retain current asset objects indefinitely in this first release; retain noncurrent versions and encrypted backups at least 30 days. Do not set a 30-day expiry on all current user files. A future reviewed purge policy must protect every recoverable DB snapshot.
3. Configure and verify the mail domain SPF/DKIM and owner-approved DMARC. Request sufficient daily and burst sending quota. Use the console's corresponding regional SMTP hostname, port 465 TLS. `MAIL_DOMAIN_VERIFIED=true` is an operator acknowledgment after DNS/provider verification, not an automatic DNS test. No fallback to QQ/dev mail. Test QQ/163/Gmail/Outlook and relevant overseas mailboxes and record actual arrival.
4. Build: `docker compose build web`. Start ONLY DB: `docker compose up -d postgres`. Run `docker compose --profile maintenance run --rm migrate`. This creates a fresh DB with the original migration chain, not a copy of local users, sessions or administrator roles. Init creates separate non-superuser migration and runtime identities; web gets no bootstrap password. Never change old SQL or use `down -v`.
5. Start the BASIC AUTH protected staging site: `docker compose up -d web edge`. Generate the staging hash using Caddy's interactive `hash-password`; don't pass a plaintext password in command arguments. HTTPS requires working DNS and reachable 80/443. Default readiness is 503 until approval; liveness remains available. Edge depends on service start, so maintenance can still configure the protected site.
6. Register the genuine operator through verified email on the staging site. Bootstrap ONLY that existing account with `docker compose --profile maintenance run --rm maintenance node --import tsx scripts/admin-bootstrap.ts --email <operator email>`. This is the existing M008 audited one-time initialization, not an application endpoint. Subsequent operators are assigned in the admin UI.
7. Publish the approved homepage/metadata; create real activities; ensure no fictional brand/contacts/permissions appear. Production public event/project readers hide demo records, keeping them in the DB for history. Original migration 0012 is not rewritten. Private materials remain private; official approval is separate from public publishing. Brand/legal copy needs a reviewed source/content update where it is still a shared static setting; do not declare these owner inputs complete automatically.

Commands above run from deploy/. Full environment values, Compose resolved output, backups and authenticated browser reports must not be uploaded to CI or chat. Runtime env only enters containers, never the image build.

## Backup and restore BEFORE launch

Run `docker compose --profile maintenance run --rm maintenance node --import tsx scripts/production-backup.ts create`. It creates an authenticated AES-256-GCM encrypted custom-format pg_dump, uploads to a separate private bucket and reads/decrypts it back for integrity verification. Maximum dump size 512MiB in this initial implementation; larger DBs fail visibly and need a streaming backup implementation before promotion. The website still runs while pg_dump takes a consistent snapshot.

Create a separate empty `atox_restore_<case>` PostgreSQL DB owned by the migrator. Run the maintenance image with DATABASE_URL overridden to that target and RESTORE_ACK=empty-isolated-database-only, then `scripts/production-backup.ts restore <backup-key>`. The script refuses other database names and nonempty targets, authenticates the complete ciphertext before executing SQL, and restores within one transaction. Verify users, roles, materials and all referenced asset bytes against the snapshot. Never restore over the active production DB.

Assets remain immutable at stable keys, including logically deleted files, so old DB snapshots can recover matching attachments. DB/API authorization revokes public access immediately; a private bucket URL must never bypass the application. Bucket versioning remains necessary against accidental overwrite. Encryption keys are held separately in controlled company recovery storage with their matching backup generation; rotating keys must preserve old recovery keys.

Install `backup.service` and `backup.timer` under /etc/systemd/system, adjusting the reviewed checkout path. Enable the timer. Set external alerting for unit failure, last successful verified backup age >60 minutes, disk usage, database errors, certificate expiry and availability. Configure the actual on-call destination. Hourly backup plus 30-day retention is a target, not proof of RPO: a failed or long-running backup immediately breaks the 1h target and must alert. RTO 4h requires a timed clean-host rehearsal.

## Controlled public release

Pass [all gates](RELEASE-GATES.md), set LAUNCH_APPROVED=true, recreate web, run `production-preflight.ts` through the maintenance service, and verify `/api/health/ready`. Only THEN set CADDY_CONFIG=./Caddyfile.production and recreate edge. Do not remove staging BASIC AUTH before this point. Production preflight checks configuration and schema; it cannot certify DNS, real delivery, human content review or load by itself.

Future releases build a new immutable SHA-tagged image, enter staging/maintenance protection, create and verify a backup, stop web for schema migration, run the dedicated migration job, restart and check readiness and business flows, then reopen access. Failed checks keep protection enabled. The initial deployment supports one web process/replica; do not enable cluster workers or add replicas while relying on the process-local write coordinator.

Rollback means first protect/stop the site. If schema-compatible, deploy the previous reviewed image. Otherwise restore the matching DB snapshot into a new empty DB, verify its asset references and roles, then switch the connection and code together. Never automatically roll code back against an incompatible migrated schema or overwrite the current DB. Preserve the failed generation for investigation.

## What is still external

No cloud account/domain/SMTP/OSS keys are present. Purchasing, actual cloud ACL, HTTPS, sender DNS, mailbox delivery, mainland/overseas tests, target-hardware 300-VU load and cloud restore timing remain explicit release blockers until evidenced. CI fixtures cannot certify these. No resources are bought, no production is deployed, and no real local user data is migrated by this module.
