import { Briefcase, Code, Headphones, Music, Palette, Zap } from "lucide-react";

import { figmaAssets } from "../assets/figmaAssets.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { Logo } from "./Logo.js";

export function MascotShowcase() {
  const { t } = useLanguage();

  const masterModes = [
    {
      description: t.mascotShowcase.mode1Desc,
      gradient: "from-[#FF6A3D] to-[#FF8866]",
      icon: Zap,
      image: figmaAssets.heroMascot,
      title: t.mascotShowcase.mode1Title
    },
    {
      description: t.mascotShowcase.mode2Desc,
      gradient: "from-[#FF8866] to-[#FFA07A]",
      icon: Code,
      image: figmaAssets.builderMascot,
      title: t.mascotShowcase.mode2Title
    },
    {
      description: t.mascotShowcase.mode3Desc,
      gradient: "from-[#FF6A3D] to-[#E55A2F]",
      icon: Briefcase,
      image: figmaAssets.codingMascot,
      title: t.mascotShowcase.mode3Title
    },
    {
      description: t.mascotShowcase.mode4Desc,
      gradient: "from-[#FF8866] to-[#FF6A3D]",
      icon: Headphones,
      image: figmaAssets.assistantMascot,
      title: t.mascotShowcase.mode4Title
    },
    {
      description: t.mascotShowcase.mode5Desc,
      gradient: "from-[#FFA07A] to-[#FF8866]",
      icon: Palette,
      image: figmaAssets.designMascot,
      title: t.mascotShowcase.mode5Title
    },
    {
      description: t.mascotShowcase.mode6Desc,
      gradient: "from-[#FF6A3D] to-[#FFA07A]",
      icon: Music,
      image: figmaAssets.chillMascot,
      title: t.mascotShowcase.mode6Title
    }
  ];

  return (
    <section className="bg-white py-24" id="mini-claw">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <div className="mb-6 flex items-center justify-center gap-1">
            <Logo size="lg" theme="light" variant="vertical" />
            <div className="inline-flex items-center rounded-full bg-[#FFEEE6] px-5 py-2.5">
              <span className="text-sm font-semibold text-[#FF6A3D]">{t.mascotShowcase.badge}</span>
            </div>
          </div>

          <h2 className="mb-6 text-4xl font-bold text-[#2D2D2D] lg:text-5xl">{t.mascotShowcase.title}</h2>
          <p className="mx-auto max-w-3xl text-xl text-[#666666]">{t.mascotShowcase.description}</p>
        </div>

        <div className="mb-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {masterModes.map((mode) => (
            <div
              className="group relative rounded-2xl border-2 border-[#FF6A3D]/10 bg-gradient-to-br from-white to-[#FFF8F3] p-6 transition-all hover:-translate-y-2 hover:border-[#FF6A3D]/30 hover:shadow-xl"
              key={mode.title}
            >
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${mode.gradient} shadow-lg`}>
                <mode.icon className="text-white" size={24} />
              </div>

              <div className="mb-4 aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-[#FFEEE6] to-[#FFF5ED] p-6">
                <img alt={mode.title} className="h-full w-full object-contain opacity-90 transition-all group-hover:scale-105 group-hover:opacity-100" src={mode.image} />
              </div>

              <h3 className="mb-1 text-lg font-bold text-[#2D2D2D]">{mode.title}</h3>
              <p className="text-sm text-[#666666]">{mode.description}</p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border-2 border-[#FF6A3D]/20 bg-gradient-to-br from-[#FFEEE6] to-[#FFF5ED] p-12 text-center">
          <h3 className="mb-4 text-2xl font-bold text-[#2D2D2D] lg:text-3xl">{t.mascotShowcase.summaryTitle}</h3>
          <p className="mx-auto max-w-2xl text-lg text-[#666666]">{t.mascotShowcase.summaryDescription}</p>
        </div>
      </div>
    </section>
  );
}
