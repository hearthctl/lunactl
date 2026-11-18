## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues of hearthctl/lunactl (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Releases

See [docs/releasing.md](docs/releasing.md). Agents must never change `version` in
`custom_components/lunactl/manifest.json` unless the issue explicitly asks for a
release. Feature and fix PRs leave it unchanged.
