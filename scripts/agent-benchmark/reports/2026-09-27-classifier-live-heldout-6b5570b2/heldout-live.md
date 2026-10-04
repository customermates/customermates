# Fair classifier retest, stage 4: live A/B

Campaign `6b5570b2`, source `e450d6d0` (clean), one build, shipped arm only, cap 35 USD, spend 30.27 USD (episodes 17.03, of which 0.23 conservative reservations;
rubric judges 12.95, of which 0.82 conservative reservations for failed calls; gold-fact judge 0.27). 1,848 episodes, none skipped, errored or rerun. Method and gates:
`classifier-eval/heldout/PREREGISTRATION.md` (Amendment 1) and `METHOD` in `classifier-eval/heldout-live/analyse.ts`,
committed in `e450d6d0` before any episode. Full numbers: `heldout-live.json`; per-episode gold-fact verdicts:
`docs-fact-verdicts.json`; the generic benchmark report: `report.md`.

## Docs re-rank v2 (Jev): gate fails

| Measure (DH, 30 cases x k = 10, 300 pairs) | off | docs-v2-jev | Difference |
| --- | ---: | ---: | --- |
| Pass (oracle + gold-fact judge yes) | 84.3 % [79.8, 88.0] | 93.0 % [89.5, 95.4] | +8.7 pts [3.0, 15.7]; McNemar 30 vs 4, p = 6.2e-6 (Holm same) |
| pass^10 | 19/30 | 26/30 | |
| Credits per turn | 1.123 | 1.057 | -5.9 % [-9.8, -2.2] |
| Rounds per turn | 3.45 | 2.83 | -0.62 [-0.86, -0.40] |
| First output p95 | 2.54 s | 3.55 s | +1.00 s [0.43, 1.43] |
| First output p50 | 1.55 s | 2.73 s | +1.18 s [1.11, 1.25] |

Gate: pass improves (yes), credits within +3 % (yes), first output p95 within +0.5 s (no), no strict or safety
regression on the full suite (no: M8 `delete-scoped-to-target` failed in 1 of 3 candidate repetitions after 3 of 3 in
control; the model sent a malformed record id to a delete that the driver rejected, and no re-rank call ran in that
turn). Full suite pass 95.4 % vs 96.3 %, McNemar 7 vs 9, p = 0.80.

## Toolset routing v2 (Jev): gate fails

| Measure (RH, 60 cases x k = 5, 300 pairs, 400 turns) | off | routing-v2-jev | Difference |
| --- | ---: | ---: | --- |
| Pass | 78.0 % [73.0, 82.3] | 77.0 % [71.9, 81.4] | -1.0 pts [-3.0, +0.3]; McNemar 2 vs 5, p = 0.45 |
| pass^5 | 45/60 | 45/60 | |
| Rounds per turn | 4.49 | 4.49 | -0.01 [-0.16, +0.13] |
| load_toolset calls per turn | 0.393 | 0.373 | -0.02 [-0.054, +0.007] |
| Prompt bytes per turn | 437,065 | 430,912 | -1.4 % [-5.5, +2.4] |
| Credits per turn | 1.378 | 1.425 | +3.4 % [-0.9, +8.1] |
| First output p50 | 2.27 s | 4.42 s | +2.15 s [2.06, 2.26] |

Gate: non-inferior pass (yes), rounds or load_toolset fall (no), prompt bytes within +3 % (yes), credits within +3 %
(no), first output p50 within +0.2 s (no), full suite (yes: no regression; pass 95.4 % vs 94.4 %, p = 0.75).

## Caveats

- Variants are server environments, so arms ran one after another, not interleaved per case as the pre-registration
  asks. Round 0 of every turn had identical prompt bytes and output tokens across arms and runs before either
  classifier can act on docs, yet its provider time rose from 1.7 s (off, DH) to 3.9 s (docs-v2-jev, DH) and off's own
  RH round 0 drifted from 2.2 s to 3.6 s within 30 minutes. The latency gates are therefore confounded with provider
  load over time; the cost, rounds and pass-rate results are not affected by this.
- Credits are whole credits per turn; exact USD per turn is in `heldout-live.json` (docs -9.4 %, routing +5.0 %).
- The benchmark report's generic Pass column counts DH episodes by their deterministic oracle only (runtime and
  read-only safety), without the gold-fact judge.
