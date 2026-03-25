# Onboarding Design Baseline

SlackClaw onboarding should feel like a centered macOS setup experience, not a generic full-width web app.

## Layout

- Main content width: `clamp(windowWidth × 0.70, 672, 1120)`
- Safe range: `64%–70%` of the window width
- Ideal content aspect ratio: `1.60–1.62 : 1`
- Step-1 welcome card height: `clamp(contentWidth ÷ 1.74, 520, 616)` so common 1280-class windows stay flatter and better centered
- Header/logo text zone: `min(768, contentWidth × 0.73)`
- Side gutters on wide windows should naturally land around `15%–16%`
- Use an 8-point spacing grid

Reference desktop composition:

- Main panel: `1056 × 656`
- Side gutters: `240px`
- Header/logo text zone: `768px` max

## Native window sizing

- Default onboarding window size: `1280 × 860`
- Minimum size: `960 × 720`
- Keep the window resizable
- Do not force full-screen on first launch
- As the window grows, keep content centered and capped by the layout formula above

## Typography

- Use the system font in code
- For mockups and design files, the intended family is SF Pro
- Let macOS choose its normal CJK fallback fonts for Chinese, Japanese, and Korean

Preferred sizes:

- Hero title: `34 / 40`, semibold
- Intro/subtitle: `16 / 24`, regular
- Feature card title: `20 / 26`, semibold
- Feature card body: `14 / 20`, regular
- Primary button label: `15 / 20`, semibold
- Meta/progress text: `12 / 16`, medium

## Spacing and shape

- Outer panel padding: `32`
- Inner feature card padding: `24`
- Gap between feature cards: `16–20`
- Gap between title and subtitle: `8–12`
- Gap between sections: `24–32`
- Outer radius: `24`
- Feature card radius: `16`
- Icon tile radius: `12`
- Primary CTA height: `48–52`

## Product rules

- The onboarding language selector should stay available across the whole flow, not only on the welcome step
- Each client should reuse its existing shared language-selector component rather than adding onboarding-only picker logic unless the platform requires a native equivalent
- These rules are the baseline for welcome/setup screens first, then should guide the later onboarding steps as they are refined
