import { Github, MousePointerClick, ShieldCheck } from "lucide-react";

import { useLanguage } from "../i18n/LanguageContext.js";

export function Features() {
  const { t } = useLanguage();

  const features = [
    {
      description: t.features.feature1Desc,
      icon: MousePointerClick,
      title: t.features.feature1Title
    },
    {
      description: t.features.feature2Desc,
      icon: Github,
      title: t.features.feature2Title
    },
    {
      description: t.features.feature3Desc,
      icon: ShieldCheck,
      title: t.features.feature3Title
    }
  ];

  return (
    <section className="relative overflow-hidden bg-white py-20 lg:py-28" id="features">
      <div className="absolute top-20 left-10 h-64 w-64 rounded-full bg-[#FF6A3D] opacity-[0.03] blur-3xl" />
      <div className="absolute top-40 right-20 h-80 w-80 rounded-full bg-[#FF8866] opacity-[0.04] blur-3xl" />
      <div className="absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-[#FFEEE6] opacity-50 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFFBF8]/30 via-transparent to-[#FFF8F3]/40" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <div className="mb-6 inline-flex items-center rounded-full bg-[#FF6A3D] px-5 py-2.5 shadow-[0_2px_16px_rgba(255,106,61,0.25)]">
            <span className="text-sm font-semibold text-white">{t.features.badge}</span>
          </div>

          <h2 className="mb-6 text-4xl font-bold text-[#2D2D2D] lg:text-5xl">{t.features.title}</h2>
          <p className="mx-auto max-w-3xl text-xl leading-relaxed text-[#666666]">{t.features.description}</p>
        </div>

        <div className="grid gap-8 md:grid-cols-3 lg:gap-10">
          {features.map((feature, index) => (
            <div
              className="group relative flex aspect-square flex-col justify-between rounded-[2rem] border border-[#FFE5D9]/40 bg-gradient-to-br from-white to-[#FFFBF8] p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_8px_40px_rgba(255,106,61,0.15)]"
              key={feature.title}
            >
              <div className="absolute -top-2 -right-2 h-20 w-20 rounded-full bg-gradient-to-br from-[#FF6A3D]/10 to-transparent opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
              <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-br from-white/80 via-transparent to-[#FFF5ED]/30" />
              <div className="absolute top-6 right-6 text-6xl leading-none font-bold text-[#FF6A3D]/10 transition-colors duration-300 group-hover:text-[#FF6A3D]/20">
                0{index + 1}
              </div>

              <div className="relative z-10">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF6A3D] to-[#FF8866] shadow-[0_4px_16px_rgba(255,106,61,0.3)] transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_6px_24px_rgba(255,106,61,0.4)]">
                  <feature.icon className="text-white" size={32} strokeWidth={2.5} />
                </div>

                <h3 className="mb-4 text-2xl font-bold text-[#2D2D2D]">{feature.title}</h3>
              </div>

              <p className="relative z-10 text-base leading-relaxed text-[#666666]">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
