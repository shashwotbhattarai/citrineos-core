# Git Configuration and Commands

## Remote Configuration
- **origin**: `https://github.com/shashwotbhattarai/citrineos-core.git`
- **upstream**: `https://github.com/citrineos/citrineos-core`

## Sync Commands
To keep origin/main in sync with upstream/main:
```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## Branch Management
Created branches:
- `yatri-dev` - Development branch for Yatri features
- `yatri-test` - Testing branch for Yatri features

Current branch: `yatri-test`

## Git Commands Used
```bash
# Initial remote setup
git remote add upstream https://github.com/citrineos/citrineos-core

# Syncing with upstream
git fetch upstream
git checkout main
git merge upstream/main
git push origin main

# Branch creation and switching
git switch shashwot
git switch -c yatri-dev
git switch -c yatri-test
```