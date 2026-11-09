# Community agreement

The Results distribution panel describes agreement among the available votes.
It does not estimate how representative those votes are of all F1 fans.

For two ratings of the same driver in the same race, they count as agreeing
when their absolute difference is at most one point. Race agreement is the
percentage of distinct vote pairs that agree:

`100 * agreeing pairs / all pairs`

Equal-score pairs agree. Bucket counts permit the calculation without exposing
or expanding individual votes.

At least **two votes in the same race** are required to assess it. The season
agreement score is the equally weighted mean of assessed race scores. Single-vote
races remain in the season histogram and pooled average, but do not enter the
agreement score. Coverage is shown as assessed races / races with votes. A label
appears after five assessed races, or after five Quick Rate votes; before that
the score is shown without a label. Quick Rate uses the same pair calculation
directly on its season-wide votes.

| Agreement score | Label |
| --- | --- |
| 90–100 | ALMOST ALL AGREE |
| 75–below 90 | MOSTLY AGREE |
| 55–below 75 | OPINIONS DIFFER |
| Below 55 | STRONGLY DIVIDED |

The one-point tolerance and label boundaries are product choices, not
statistical significance thresholds. An agreement score is the share of voter
pairs within the tolerance, not a percentage of people who agree.
`STRONGLY DIVIDED` deliberately makes no claim that the distribution consists
of two opposing camps.

The main community season rating still averages all race means equally;
`POOLED AVG` in the histogram weights each vote equally. Agreement measures
closeness of opinions, independently of either performance average.

Apply `community_rating_agreement` before deploying the frontend. The additive
`get_community_rating_distributions_by_round(p_kind, p_season)` RPC returns
aggregate counts by race and uses a null round for Quick Rate. A driver's
distribution is withheld below two total votes. The original pooled RPC stays
available to older clients. Raw ratings retain ownership RLS; privileged helpers
remain in the unexposed `community_private` schema and require an authenticated
identity. No user IDs are returned.

Run the Vitest suite and `supabase/tests/community_rating_agreement.sql` inside
`BEGIN` / `ROLLBACK` against a migrated database. The database assertions use
temporary guest identities and leave no fixture votes behind.
