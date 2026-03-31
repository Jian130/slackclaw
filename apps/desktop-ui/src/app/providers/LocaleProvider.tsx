import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";

import { detectLocale, localeOptions, type Locale } from "../../shared/i18n/messages.js";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider(props: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale());

  const value = useMemo(
    () => ({
      locale,
      setLocale(next: Locale) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("chillclaw.locale", next);
        }
        setLocaleState(next);
      }
    }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{props.children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);

  if (!value) {
    throw new Error("useLocale must be used within LocaleProvider");
  }

  return value;
}

export { localeOptions };
