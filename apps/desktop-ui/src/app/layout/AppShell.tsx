import type { PropsWithChildren } from "react";
import { MessageSquareText, Sparkles } from "lucide-react";
import { NavLink } from "react-router-dom";

import { useLocale } from "../providers/LocaleProvider.js";
import { useOverview } from "../providers/OverviewProvider.js";
import { SidebarNav } from "../../shared/ui/SidebarNav.js";
import { LanguageSelector } from "../../shared/ui/LanguageSelector.js";
import { LoadingPanel } from "../../shared/ui/LoadingPanel.js";
import { t } from "../../shared/i18n/messages.js";

function FeedbackWidget() {
  return (
    <button className="feedback-widget" type="button">
      <MessageSquareText size={16} />
      <span>Feedback</span>
    </button>
  );
}

export function AppShell(props: PropsWithChildren<{ loading?: boolean }>) {
  const { locale } = useLocale();
  const { overview } = useOverview();
  const copy = t(locale);

  const statusLabel = !overview
    ? copy.common.loading
    : overview.engine.running
      ? copy.shell.active
      : overview.engine.installed
        ? copy.shell.attention
        : copy.shell.setupRequired;

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <NavLink className="brand" to="/">
          <div className="brand__mark">
            <Sparkles size={22} />
          </div>
          <div>
            <h1>SlackClaw</h1>
            <p>OpenClaw Made Easy</p>
          </div>
        </NavLink>
        <SidebarNav />
        <div className="sidebar-status">
          <p className="sidebar-status__title">
            {copy.shell.status}: {statusLabel}
          </p>
          <p>{overview?.engine.summary ?? copy.common.connecting}</p>
        </div>
        <div className="sidebar-language">
          <LanguageSelector />
        </div>
      </aside>
      <main className="app-main">
        <header className="app-topbar">
          <div />
        </header>
        <section className="app-content">
          {props.loading ? <LoadingPanel title={copy.common.loading} description={copy.common.connecting} /> : props.children}
        </section>
      </main>
      <FeedbackWidget />
    </div>
  );
}
