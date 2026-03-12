# Changelog

## Unreleased

### Deploy and runtime management

- added deploy target detection for installed and installable OpenClaw runtimes
- added install, update, and uninstall flows for the current OpenClaw targets
- added current/latest version display and in-card update actions on the Deploy page
- added deploy/update progress tracking in the UI

### Model management

- replaced provider-only configuration with saved model entries
- added create and edit flows for saved model entries
- added default and fallback role management for saved entries
- changed normal saved entries so they stay as SlackClaw metadata until promoted into the runtime chain
- aligned model auth/setup commands with the current OpenClaw CLI `models auth` surface instead of relying on onboarding flows for single-secret provider auth
- reconciled SlackClaw saved entries against the live OpenClaw runtime model chain so the UI reflects `openclaw models list --json`

### Channel and gateway behavior

- restart the OpenClaw gateway after runtime-affecting model and channel configuration changes
- verify gateway health after restart before reporting success
- improved Telegram, WhatsApp, Feishu, and WeChat setup flows and recovery messaging

### Compatibility and tests

- added an engine compatibility manifest and developer compatibility runner for evaluating new OpenClaw versions
- added fixture-based compatibility parsing tests for OpenClaw CLI output
- added co-located tests for adapter, service, contract, and UI behavior around deploy/config flows

### Developer experience

- added development-mode logging for executed OpenClaw commands from the daemon
