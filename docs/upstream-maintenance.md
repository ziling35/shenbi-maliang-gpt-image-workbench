# Upstream Maintenance Workflow

This repository is maintained independently while periodically integrating changes from the upstream project.

## Remote Roles

- `origin`: the independently maintained repository. All branches and releases are pushed here.
- `upstream`: the source repository used only for fetching updates.

Verify the configuration with:

```bash
git remote -v
```

The expected repositories are:

```text
origin    https://github.com/ziling35/shenbi-maliang-gpt-image-workbench.git
upstream  https://github.com/Xiongdaxz/shenbi-maliang-gpt-image-workbench.git
```

## Branch Roles

- `main`: stable and deployable code only.
- `feature/*`: new features.
- `fix/*`: bug fixes.
- `chore/*`: maintenance and tooling changes.
- `sync/upstream-*`: temporary branches used to integrate upstream updates.

Do not develop directly on `main`. Create a scoped branch and merge it through a pull request.

## Start a Change

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/short-description
```

After committing the change:

```bash
git push -u origin feature/short-description
```

Open a pull request from the feature branch into `main`. Run the following checks before merging:

```bash
bun install
bun run check
bun run build
```

## Sync Upstream

Fetch the latest upstream branches and tags:

```bash
git fetch upstream --tags --prune
```

Create a dated synchronization branch from the latest local `main`:

```bash
git switch main
git pull --ff-only origin main
git switch -c sync/upstream-YYYYMMDD
git merge upstream/main
```

Resolve conflicts by preserving local customizations while integrating upstream behavior. Do not accept all `ours` or all `theirs` changes without reviewing each conflict.

After resolving conflicts, run the checks and push the synchronization branch:

```bash
bun install
bun run check
bun run build
git push -u origin sync/upstream-YYYYMMDD
```

Open a pull request from the synchronization branch into `main`. Delete the temporary branch after the pull request is merged.

To cancel an unresolved upstream merge:

```bash
git merge --abort
```

## Releases

Use a separate tag namespace for independently maintained releases so they cannot be confused with upstream tags:

```bash
git tag -a custom-v0.1.63.1 -m "Independent maintenance release"
git push origin custom-v0.1.63.1
```

Back up the complete `data/` directory before deploying an upstream synchronization or database migration.
