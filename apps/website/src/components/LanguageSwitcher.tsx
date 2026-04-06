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
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-[#666666] transition-colors hover:bg-[#FF6A3D]/10 hover:text-[#FF6A3D]"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <Globe size={18} />
        <span className="text-sm">{languages[language]}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-[#FF6A3D]/15 bg-white shadow-[0_14px_40px_rgba(45,45,45,0.12)]">
          {Object.entries(languages).map(([code, name]) => (
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[#FFEEE6]"
              key={code}
              onClick={() => {
                setLanguage(code as Language);
                setIsOpen(false);
              }}
              type="button"
            >
              <span className={`text-sm ${language === code ? "font-semibold text-[#FF6A3D]" : "text-[#666666]"}`}>
                {name}
              </span>
              {language === code ? <Check className="text-[#FF6A3D]" size={16} /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
