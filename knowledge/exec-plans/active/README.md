# Active execution plans

Multi-step plans currently being executed. Each plan is a markdown document
with frontmatter `name`, `overview`, and `todos`.

When a plan is finished, move it to `../completed/` so the active list stays
short and useful.

## Conventions

- One file per plan, kebab-case filename.
- Status of each todo: `pending` / `in_progress` / `completed` / `cancelled`.
- Plans cite specific file paths.
- Plans don't replace product specs — they coordinate work that touches
  several specs at once.
