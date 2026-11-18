# Release the integration

The integration version in `custom_components/lunactl/manifest.json` follows
SemVer (`MAJOR.MINOR.PATCH`). It is independent of the firmware's `project`
version in `esphome/lunactl.yaml`, whose major version tracks the highest
supported Manifest schema version ([ADR 0004](adr/0004-geraet-meldet-schema-version-ueber-firmware-version.md)).

Feature and fix PRs leave `version` in `manifest.json` unchanged. Change it only
in a release PR: parallel PRs must not each bump to the same version. Agents
must never change it unless the issue explicitly asks for a release.

To cut a release:

1. Open a release PR that bumps `version` in
   `custom_components/lunactl/manifest.json` to the next SemVer version. Run
   `make verify` and merge the PR.
2. Copy the exact merge commit SHA from the merged release PR and fetch `main`
   to make that commit available locally. Tag the copied SHA with `v` followed
   by the exact integration version. For example, for `"version": "1.0.1"`,
   replace `RELEASE_COMMIT_SHA` with the SHA you copied:

   ```sh
   git fetch origin main
   git tag v1.0.1 RELEASE_COMMIT_SHA
   git push origin v1.0.1
   ```

3. The release workflow at `.github/workflows/release.yml`, delivered separately
   in [#85](https://github.com/hearthctl/lunactl/pull/85), handles tag pushes
   matching `v*`. It fails without creating a release unless the tag equals `v`
   plus `version` in the tagged commit's
   `custom_components/lunactl/manifest.json`. When they match, it creates the
   GitHub release for that tag with generated release notes. Ensure #85 is
   merged before pushing the first release tag.

HACS offers these GitHub releases as integration updates. See
[the household update steps](household.md#update-lunactl-through-hacs).
