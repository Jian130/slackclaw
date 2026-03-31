# Onboarding Design and Flow Reference

ChillClaw onboarding should feel like a centered macOS setup experience, not a generic full-width web app.

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

## Current implementation snapshot

The current implementation now follows the same six primary steps in both web and native clients, then shows a completion summary after finalization. It is much closer to the target contract than the earlier seven-step version, but a few gaps still remain.

Several parts of the target contract are already implemented: curated onboarding model/channel metadata, curated employee preset presentation, and managed preset-skill ownership all come from daemon-owned config so web and native no longer carry separate onboarding catalogs.

```mermaid
sequenceDiagram
    actor User
    participant UI as "Web/Native Onboarding UI"
    participant Onboarding as "OnboardingService"
    participant Setup as "SetupService"
    participant Config as "EngineAdapter.config"
    participant Team as "AITeamService"
    participant Gateway as "EngineAdapter.gateway"
    participant OpenClaw

    User->>UI: Step 1 Welcome
    UI->>Onboarding: POST /api/onboarding/navigate

    User->>UI: Step 2 Detect / install / reuse / update runtime
    UI->>Onboarding: POST /api/onboarding/runtime/detect
    alt User installs managed runtime
        UI->>Onboarding: POST /api/onboarding/runtime/install
        Onboarding->>Setup: runFirstRunSetup()
        Setup->>OpenClaw: detect existing runtime
        Setup->>OpenClaw: reuse or install runtime
        Setup-->>Onboarding: install result
        Onboarding-->>UI: updated onboarding state
    else User reuses existing runtime
        UI->>Onboarding: POST /api/onboarding/runtime/reuse
        Onboarding-->>UI: updated onboarding state
    else User updates current runtime
        UI->>Onboarding: POST /api/onboarding/runtime/update
        Onboarding->>OpenClaw: update runtime
        Onboarding-->>UI: updated onboarding state
    end

    User->>UI: Step 3 Permissions
    UI->>Onboarding: POST /api/onboarding/permissions/confirm

    User->>UI: Step 4 Save first model
    UI->>Onboarding: POST /api/onboarding/model/entries
    Onboarding->>Config: save model config/auth
    Config->>OpenClaw: write model auth/config
    Config-->>Onboarding: mutation or auth session
    Onboarding-->>UI: saved draft or interactive auth session
    opt Interactive provider auth
        UI->>Onboarding: GET/POST onboarding model auth session routes
        Onboarding->>Config: continue auth session
        Config->>OpenClaw: finish provider auth
        Onboarding-->>UI: updated onboarding state
    end

    User->>UI: Step 5 Save first channel
    UI->>Onboarding: POST /api/onboarding/channel/entries
    Onboarding->>ChannelSetup: save onboarding channel entry
    alt Telegram / Feishu / WeChat Work
        ChannelSetup->>OpenClaw: write channel config
        ChannelSetup-->>Onboarding: saved channel state
        Onboarding-->>UI: staged channel state
    else Personal WeChat
        ChannelSetup->>OpenClaw: start live login or install session
        ChannelSetup-->>Onboarding: active session returned
        Onboarding-->>UI: active channel session
    end

    User->>UI: Step 6 Create AI employee
    UI->>Onboarding: POST /api/onboarding/employee
    Onboarding-->>UI: employee draft saved

    User->>UI: Finalize onboarding
    UI->>Onboarding: POST /api/onboarding/complete
    Onboarding->>Team: saveMemberForOnboarding()
    Team->>OpenClaw: create agent/workspace and bindings
    Onboarding->>Gateway: finalizeOnboardingSetup()
    Gateway->>OpenClaw: install or restart gateway
    Gateway->>OpenClaw: verify reachability
    Onboarding-->>UI: completion summary + setupCompleted=true
```

## Target onboarding contract

This is the correct flow to optimize for in new design and engineering work. The daemon should own the step contract, completion gates, curated metadata, and final apply semantics.

```mermaid
sequenceDiagram
    actor User
    participant UI as "Web/Native Onboarding UI"
    participant Onboarding as "Onboarding Flow Kernel"
    participant Setup as "Runtime Setup Service"
    participant Config as "EngineAdapter.config"
    participant Team as "AI Employee Service"
    participant Gateway as "EngineAdapter.gateway"
    participant OpenClaw

    User->>UI: Step 1 Welcome
    UI->>Onboarding: Start onboarding flow

    User->>UI: Step 2 Detect runtime
    UI->>Setup: read runtime status
    Setup->>OpenClaw: detect install + update availability
    Setup-->>UI: installed? update available?
    alt Not installed
        User->>UI: Install
        UI->>Setup: install runtime
        Setup->>OpenClaw: install or reuse compatible runtime
        Setup-->>UI: installed
    else Installed and update available
        UI-->>User: Offer update now or later
        opt User chooses update
            UI->>Setup: update runtime
            Setup->>OpenClaw: update runtime
            Setup-->>UI: updated
        end
    end

    User->>UI: Step 3 Permissions
    UI->>Onboarding: persist permission state
    Onboarding-->>UI: unlock next step only when policy satisfied

    User->>UI: Step 4 Configure first model
    UI->>Onboarding: read curated 3 providers from config
    UI->>Config: save model auth/config
    Config->>OpenClaw: write model config only
    Config-->>UI: saved
    Note over Config,OpenClaw: No gateway start, no health check, no extra finalize work

    User->>UI: Step 5 Configure first channel
    UI->>Onboarding: read curated channel list from config
    UI->>Config: save channel config
    Config->>OpenClaw: write channel config only
    Config-->>UI: saved
    Note over Config,OpenClaw: No gateway start, no health check, no extra finalize work

    User->>UI: Step 6 Pick preset + enter name/title
    UI->>Onboarding: submit final onboarding payload
    Onboarding->>Team: create AI employee from chosen preset
    Team->>OpenClaw: create agent/workspace and preset config
    Onboarding->>Gateway: apply all staged config once
    Gateway->>OpenClaw: install/restart gateway
    Gateway->>OpenClaw: verify healthy
    Onboarding-->>UI: onboarding completed
    UI-->>User: success screen and enter app
```

## Step rules

1. `Welcome` should only start or resume the guided flow.
2. `Detect Runtime` should decide whether ChillClaw installs, reuses, or updates the managed OpenClaw runtime.
3. `Permissions` should be a real gate owned by the daemon, not just a client-side informational step.
4. `Configure First Model` should show only the three curated onboarding providers from daemon-owned config and should only write model configuration.
5. `Configure First Channel` should show only the curated onboarding channels from daemon-owned config and should only write channel configuration.
6. `Create AI Employee` should collect the preset plus user-facing identity fields, then run one finalization pass that creates the first AI employee and applies staged runtime changes once.

## Flow invariants

- Keep the `UI -> daemon -> EngineAdapter -> OpenClaw` boundary intact for every onboarding step.
- Keep curated model and channel metadata daemon-owned so web and native clients render the same choices.
- Keep curated onboarding employee preset presentation daemon-owned too, including avatar preset ids, starter skill labels, and tool labels.
- Keep staged config distinct from live applied state in both backend contracts and UI copy.
- Do not start the gateway, run health checks, or trigger extra finalization work during steps 4 and 5.
- Do not create the first real AI employee before the final step is submitted.

## Known gaps between current and target flow

- The daemon now enforces basic step order, but permissions are still an acknowledgement gate rather than a verified OS-permission state.
- Personal WeChat onboarding currently starts a live login/install session instead of staying config-only.
- The completion API still accepts destination shortcuts, so transport-level completion and post-completion navigation are not perfectly separated.
