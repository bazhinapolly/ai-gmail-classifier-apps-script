# Classification Evaluation

The repository contains a versioned, synthetic, non-sensitive evaluation set in [`evals/classification-cases.json`](../evals/classification-cases.json). It covers every configured category and includes prompt-injection attempts embedded in email content.

Repository checks validate the dataset structure without making paid requests:

```bash
npm run check
```

Run the selected OpenAI model against the complete set with:

```bash
OPENAI_API_KEY='your-restricted-key' \
OPENAI_MODEL='gpt-4o-mini-2024-07-18' \
npm run eval:openai > evaluation-result.json
```

The command reports overall accuracy, a per-category confusion summary, precision, recall, false positives, false negatives, confidence, and prompt-injection results. It uses `store: false` through the same payload builder as the Apps Script workflow.

No live model score is checked into this repository. A result depends on the exact model, date, account data controls, and evaluation-set review. A production rollout should expand this synthetic set with approved, representative, de-identified messages and define acceptance thresholds with the mailbox owner.
