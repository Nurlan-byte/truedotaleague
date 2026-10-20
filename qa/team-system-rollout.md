# Team system rollout

The UI checks `team_system_version()` before using the new RPCs. With the old schema (RPC missing), existing teams and rosters remain visible and team writes are paused. After the pending migration commits, the new functionality is enabled. Network/permission errors are shown as retryable errors and are not mistaken for an old schema.

The SQL in `qa/pending-migrations/0004_team_invitations.sql` is deliberately outside the automatic migration directory. Do not apply it before the production conflicts are resolved and backed up. No migration or production-data cleanup is part of this code release.

1. Run `qa/team-preflight-summary.sql` using an approved complete read-only connection. Record the role and RLS policies. Public API counts alone do not establish completeness.
2. Back up teams, members, captains, invitations if present, and related tournament references. Agree how to preserve duplicate owned teams and identify unlinked players. Never infer an account from nickname alone.
3. Agree whether to transfer ownership to another eligible registered user, consolidate teams while preserving references, or archive a team in an explicitly approved follow-up migration. Preserve unlinked rows in an archive or bind them only after identity is confirmed. This release performs none of these changes.
4. Review automatic owner/captain roster backfill and the initial main/reserve assignment (existing order, created_at, id; first five main). The pending migration saves the original roster snapshots in a private RLS-protected table before taking attributes from profiles. Keep an external database backup as well.
5. Test the reviewed migration on a backup in staging. It aborts transactionally on duplicate owners/members, unlinked/missing profiles, cross-team membership, or roster capacity above seven. No rows are deleted to resolve a conflict.
6. Apply only after the data plan is approved. Recheck grants, membership, profile synchronization, invitation acceptance, cancellation and 5+2 slots. The version RPC becomes visible only at commit.

Validation: `node qa/team-invitations-sql-check.mjs` uses isolated PGlite and the full existing migration chain. `TDL_TEST_DATABASE_URL` optionally points to a new empty loopback PostgreSQL database named `tdl_team_rework_fixture` or `tdl_team_rework_fixture_<suffix>`. Never use a production connection. The PostgreSQL path verifies three races with both contenders observed waiting on the transaction gate before it is released. It does not create any infrastructure for the deployed app.

Team membership writes use SECURITY DEFINER RPCs with an empty search_path, explicit actor/manager/owner checks, and audit records. Direct client INSERT/UPDATE/DELETE privileges, including column privileges, are revoked. Unique owner/member/pending-invitation/roster-slot constraints provide database enforcement. Captains have a foreign key to existing roster members. Profiles already contain self-editable role_position and mmr; roster values synchronize from them. Invitation links are not included.
