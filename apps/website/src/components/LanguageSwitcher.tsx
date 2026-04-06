import { Check, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useLanguage } from "../i18n/LanguageContext.js";
import { Language, languages } from "../i18n/translations.js";

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-[#6b8284] transition-colors hover:bg-[#5eb3b8]/10 hover:text-[#5eb3b8]"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <Globe size={18} />
        <span className="text-sm">{languages[language]}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border-2 border-[#5eb3b8]/20 bg-white shadow-xl">
          {Object.entries(languages).map(([code, name]) => (
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[#5eb3b8]/10"
              key={code}
              onClick={() => {
                setLanguage(code as Language);
                setIsOpen(false);
              }}
              type="button"
            >
              <span className={`text-sm ${language === code ? "font-semibold text-[#5eb3b8]" : "text-[#6b8284]"}`}>
                {name}
              </span>
              {language === code ? <Check className="text-[#5eb3b8]" size={16} /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
