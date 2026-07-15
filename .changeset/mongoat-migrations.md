---
"@iamcalegari/mongoat": minor
---

Add a versioned migrations system: `up`/`down` migration files (schema and/or data), ordered/idempotent application tracked in a control collection, and a `mongoat` CLI (`create`/`up`/`down`/`to`/`status`) shipped as a package `bin`. `tsx` is declared as an optional peer dependency for loading `.ts` migration files — no new runtime dependency is added.
