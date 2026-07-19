# Student timetable-suffix reconciliation — 2026-07-18

This report records the read-only reclassification of the immutable
`20260717-143745` TongTongTong snapshot. No upstream login, deployment, or live
sync was performed while producing these counts.

## Approved admission rule

- Decide after NFKC normalization and trimming, but preserve the accepted
  source `className`, `sourceUniqueNo`, and `classRegistrationNo` values.
- Accept a bracketless class without `*`.
- Also accept exactly one terminal suffix containing either one to three
  distinct weekdays with an optional positive slot 1..99 without a leading
  zero (`[토3]`, `[월수]`, `[월수금1]`), or `E`/`e` with that positive slot
  (`[E3]`, `[e3]`).
- Reject repeated weekdays (`[월월]`), zero or leading-zero slots (`[일00]`,
  `[일01]`), other Latin prefixes (`[Z99]`), asterisks, leading/middle/multiple
  brackets, malformed pairs, and management suffixes such as `[연장]`.
- Strip an accepted suffix only for unit/science/supplementary/representative
  classification and same-base de-duplication. The raw source assignment stays
  intact.
- Preserve `기하[시간]` as an assignment but exclude it from representative
  regular-class candidates because it is subject-only.

## Reconciled immutable baseline

| Campus | Raw rows | Included assignments | Unique students | Science any | Science only | Math + science |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 송파 | 4,752 | 1,872 | 1,735 | 180 | 66 | 114 |
| 위례 | 2,622 | 911 | 793 | 159 | 95 | 64 |
| 광진 | 2,647 | 1,016 | 849 | 335 | 226 | 109 |
| Total | 10,021 | 3,799 | 3,377 | 674 | 387 | 287 |

The previous zero values for 위례/광진 science-only students were therefore
not valid. Under the approved rule they are 95 and 226 respectively.

The full representative result is 2,986 `ONE_REGULAR`, 387 `SCIENCE_ONLY`, one
`MULTIPLE_REGULAR`, and three `NO_CLASS`. There are 371 students with multiple
accepted assignments. The legacy API field
`bracketExcludedAssignmentCount=6,222` now means rows rejected by this exact
class-name policy; its name is retained for contract compatibility.

## Release gate

Before any new publish, apply the database migration. Rehearse the offline
snapshot dry-run against the immutable directory only on a disposable fresh
database or an access-controlled restore clone, because the initial-snapshot
endpoint intentionally returns HTTP 409 when the student database is nonempty;
do not run it on populated production. Verify the exact global and campus
counts above, then destroy the rehearsal environment after retaining only safe
aggregates. A fresh live sync is required to recover source details that an
older staging run redacted under the blanket bracket exclusion.

## Production reconciliation result

Release `20260718T021814Z` was activated on 2026-07-18. The forward-only
`20260718021000_student_schedule_suffix_classes` migration completed before
activation, and the student and active-assignment counts stayed at 2,999 and
3,155 until the authorized live reconciliation began.

Manual run `f119accb-c753-4ba0-9ab2-934f421e4efe` then completed with status
`SUCCEEDED`. It made exactly one upstream login attempt, made zero automatic
login retries, left the authentication circuit `CLOSED`, and released the
sync lease. The live source had changed slightly since the immutable baseline:

| Campus | Live fetched rows | Included assignments | Unique students | Science any | Science only | Math + science |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 송파 | 6,399 | 1,876 | 1,739 | 181 | 67 | 114 |
| 위례 | 2,628 | 913 | 795 | 161 | 97 | 64 |
| 광진 | 2,648 | 1,016 | 848 | 333 | 223 | 110 |
| Total | 11,675 | 3,805 | 3,382 | 675 | 387 | 288 |

The published database therefore contains 3,382 active students and 3,805
active assignments: 2,991 `ONE_REGULAR`, 387 `SCIENCE_ONLY`, one
`MULTIPLE_REGULAR`, and three `NO_CLASS`. There are 372 students with multiple
accepted assignments and four ambiguous students in total.

Two previously missing science-only students were verified through both
PostgreSQL and the deployed administrator API:

| Campus | Source student no. | Student | School / grade | Preserved source class | Display science class |
| --- | --- | --- | --- | --- | --- |
| 위례 | `5100293` | 류시하 | 위례중앙중 / 1학년 | `과1특A[토3]` | `과1특A` |
| 광진 | `6020034` | 김가은7 | 가람고 / 1학년 | `과고1가람[일4]` | `과고1가람` |

The deployed `/student-status` server render also returned 류시하 under the
위례 science view. Anonymous access still redirects to `/login`, while an
authenticated administrator receives HTTP 200.
