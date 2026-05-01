# Fake News Review Site

This static site mirrors the interaction style of `dental.scoring.github.io`, but is adapted for fake news review.

## Rebuild

Run:

```powershell
$env:DEEPSEEK_API_KEY="your_key_here"
python .\build_fake_news_review_site.py
```

The script reads `sample_bundle_50x3`, calls the DeepSeek Chat Completions API, rewrites each sample into natural English under 600 characters while preserving the main storyline, generates `fakenews.scoring.github.io\data.js`, and copies the review images into `fakenews.scoring.github.io\assets\images`.
