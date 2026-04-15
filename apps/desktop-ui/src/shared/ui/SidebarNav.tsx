import { LayoutDashboard, Plug, Rocket, Settings2, Zap, MessageSquare, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

import { useLocale } from "../../app/providers/LocaleProvider.js";
import { t } from "../i18n/messages.js";

export function SidebarNav() {
  const { locale } = useLocale();
  const copy = t(locale).shell;
  const items = [
    { to: "/chat", label: copy.chat, icon: MessageSquare },
    { to: "/", label: copy.dashboard, icon: LayoutDashboard },
    { to: "/deploy", label: copy.deploy, icon: Rocket },
    { to: "/config", label: copy.config, icon: Settings2 },
    { to: "/skills", label: copy.skills, icon: Zap },
    { to: "/plugins", label: copy.plugins, icon: Plug },
    { to: "/settings", label: copy.settings, icon: Settings }
  ];

  return (
    <nav className="sidebar-nav">
      {items.map((item) => (
        <NavLink
          className={({ isActive }) => `sidebar-nav__item${isActive ? " sidebar-nav__item--active" : ""}`}
          key={item.to}
          to={item.to}
        >
          <item.icon size={18} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
