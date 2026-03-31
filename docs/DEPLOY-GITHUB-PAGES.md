# GitHub Pages Deployment

This repository is prepared to publish the static meal plan site from `docs/` on the `main` branch.

## Publish target

- Landing page: `docs/index.html`
- Meal plan guide: `docs/30-day-meal-plan-with-breakfasts/index.html`
- App link from landing page: `docs/app/`

## One-time GitHub setting

In the GitHub repository settings:

1. Open **Settings** -> **Pages**
2. Under **Build and deployment**, choose **Deploy from a branch**
3. Select branch **main**
4. Select folder **/docs**
5. Save

After the next push, GitHub Pages should publish:

- `https://IKnowAboutThat.github.io/1500-Calorie-Meal-Plan/`
- `https://IKnowAboutThat.github.io/1500-Calorie-Meal-Plan/30-day-meal-plan-with-breakfasts/`

## Update flow

When the guide HTML changes:

1. Replace `docs/30-day-meal-plan-with-breakfasts/index.html` with the latest exported HTML
2. Commit
3. Push to `main`
