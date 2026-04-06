import { Coffee, Shield, Smile, Sparkles, Users, Zap } from "lucide-react";

import { useLanguage } from "../i18n/LanguageContext.js";
import { Logo } from "./Logo.js";

export function Features() {
  const { t } = useLanguage();

  const features = [
    { color: "#FF6A3D", description: t.features.feature1Desc, icon: Zap, title: t.features.feature1Title },
    { color: "#FF8866", description: t.features.feature2Desc, icon: Sparkles, title: t.features.feature2Title },
    { color: "#FF6A3D", description: t.features.feature3Desc, icon: Shield, title: t.features.feature3Title },
    { color: "#FF8866", description: t.features.feature4Desc, icon: Users, title: t.features.feature4Title },
    { color: "#FF6A3D", description: t.features.feature5Desc, icon: Coffee, title: t.features.feature5Title },
    { color: "#FF8866", description: t.features.feature6Desc, icon: Smile, title: t.features.feature6Title }
  ];

  return (
    <section className="bg-white py-24" id="features">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <div className="mb-6 flex items-center justify-center gap-1">
            <Logo size="md" theme="light" variant="vertical" />
            <div className="inline-flex items-center rounded-full bg-[#FFEEE6] px-5 py-2.5">
              <span className="text-sm font-semibold text-[#FF6A3D]">{t.features.badge}</span>
            </div>
          </div>

          <h2 className="mb-6 text-4xl font-bold text-[#2D2D2D] lg:text-5xl">{t.features.title}</h2>
          <p className="mx-auto max-w-3xl text-xl text-[#666666]">{t.features.description}</p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              className="group relative rounded-2xl border-2 border-[#FF6A3D]/10 bg-gradient-to-br from-white to-[#FFF8F3] p-8 transition-all hover:-translate-y-1 hover:border-[#FF6A3D]/30 hover:shadow-xl"
              key={feature.title}
            >
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg" style={{ backgroundColor: feature.color }}>
                <feature.icon className="text-white" size={28} />
              </div>
              <h3 className="mb-3 text-xl font-bold text-[#2D2D2D]">{feature.title}</h3>
              <p className="leading-relaxed text-[#666666]">{feature.description}</p>
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 blur-xl transition-opacity group-hover:opacity-10"
                style={{ backgroundColor: feature.color }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
