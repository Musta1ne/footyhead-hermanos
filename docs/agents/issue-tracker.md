# Issue tracker: GitHub

Issues and specs for this repo live in GitHub Issues. Use the `gh` CLI from this clone; its `origin` remote identifies the repository.

## Conventions

- Create: `gh issue create --title "..." --body-file <file>` for multiline content.
- Read: `gh issue view <number> --comments`; fetch labels when triaging.
- List: `gh issue list --state open`, adding label filters as needed.
- Comment: `gh issue comment <number> --body-file <file>`.
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

When a skill says to publish to the issue tracker, create a GitHub issue. When it says to fetch a ticket, read the corresponding issue and comments.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set this to `yes` if external PRs should enter the triage queue. If enabled, use the corresponding `gh pr` commands and check a PR's diff before triaging it.

## Wayfinding operations

A wayfinder map is one issue labelled `wayfinder:map`; its child tickets are sub-issues when available. Otherwise, link children in a task list in the map body and put `Part of #<map>` in each child. Label children `wayfinder:<type>`, where type is `research`, `prototype`, `grilling`, or `task`.

Represent blockers with GitHub issue dependencies when available. Otherwise, put `Blocked by: #<n>` at the top of the child issue. Work on the first unassigned, unblocked open child in map order. Claim it by assigning yourself. On completion, comment with the answer, close the child, and add a brief decision and issue link to the map.
