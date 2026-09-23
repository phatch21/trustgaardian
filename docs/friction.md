# Friction log

Entries recorded during the hackathon window. Format per entry: task
attempted, steps taken, expected vs actual, severity, workaround, suggestion.

---

## 2026-09-23 — Document identifier not stable across tool responses

**Task attempted:** Edit a specific table cell in a working document created
earlier in the same session.

**Steps taken:** Reused the container identifier returned when the document
was created. Sent the edit.

**Expected:** The edit applies, as it had for six prior edits in the session.

**Actual:** Five consecutive rejections. The first was a legitimate content
error, but the following four returned a permission error rather than a
"document not found" error, which pointed at the wrong diagnosis and sent me
looking for an access problem that did not exist. The real cause was an
identifier mismatch between the creation response and the canonical link.

**Severity:** Medium. Not blocking, but roughly ten minutes lost to a
misleading error class.

**Workaround:** Listed artifacts to retrieve the canonical link, then used
that identifier. Worked on the first try.

**Suggestion:** Return "not found" rather than "forbidden" when an identifier
does not resolve. A permission error on a nonexistent resource is actively
misleading, and it is the kind of thing that costs real time under deadline.