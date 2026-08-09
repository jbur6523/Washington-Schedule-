# Supabase migration deployment

Migrations in `supabase/migrations/` deploy to production after they are merged into `main`. The GitHub Actions workflow serializes deployments, shows the local and remote migration state, performs a dry run, and then applies pending migrations in timestamp order.

## Required GitHub configuration

Configure these values on the repository's `production` environment:

- Secret `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token from the account that can access the production project.
- Secret `SUPABASE_DB_PASSWORD`: the production project's database password.
- Variable `SUPABASE_PROJECT_ID`: the production project reference (`xkhqdcxnllogiogahdmd`).

Before enabling the first deployment, run `supabase migration list --linked` with production credentials and verify that the existing remote migration history matches the files in `supabase/migrations/`. If schema changes were previously applied manually, repair the migration history before running `db push`; do not reapply historical SQL blindly.

## Normal workflow

1. Create a timestamped migration with `supabase migration new <description>`.
2. Test it against a local Supabase database.
3. Commit the migration on a feature branch and open a pull request.
4. Merge the pull request into `main` after review. GitHub Actions deploys only migrations that are not already recorded in the remote migration history.

The workflow can also be started manually from GitHub Actions with **Run workflow**.
