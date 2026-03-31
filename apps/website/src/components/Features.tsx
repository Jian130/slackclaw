import { Cpu, Shield, Smile, Sparkles, Users, Zap } from "lucide-react";

import accentLeft480 from "../assets/7-480.webp";
import accentLeft720 from "../assets/7-720.webp";
import accentRight480 from "../assets/8-480.webp";
import accentRight720 from "../assets/8-720.webp";
import { useLanguage } from "../i18n/LanguageContext.js";

export function Features() {
  const { t } = useLanguage();

  const features = [
    { icon: Zap, title: t.features.feature1Title, description: t.features.feature1Desc, color: "text-[#5eb3b8]", bgColor: "bg-[#5eb3b8]/10" },
    { icon: Sparkles, title: t.features.feature2Title, description: t.features.feature2Desc, color: "text-[#f5c563]", bgColor: "bg-[#f5c563]/10" },
    { icon: Shield, title: t.features.feature3Title, description: t.features.feature3Desc, color: "text-[#5eb3b8]", bgColor: "bg-[#5eb3b8]/10" },
    { icon: Users, title: t.features.feature4Title, description: t.features.feature4Desc, color: "text-[#ffa463]", bgColor: "bg-[#ffa463]/10" },
    { icon: Smile, title: t.features.feature5Title, description: t.features.feature5Desc, color: "text-[#f5c563]", bgColor: "bg-[#f5c563]/10" },
    { icon: Cpu, title: t.features.feature6Title, description: t.features.feature6Desc, color: "text-[#5eb3b8]", bgColor: "bg-[#5eb3b8]/10" }
  ];

  return (
    <section className="bg-white py-20" id="features">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative mb-16 text-center">
          <div className="absolute top-0 left-0 hidden h-32 w-32 opacity-20 lg:block">
            <img
              alt=""
              className="h-full w-full object-contain"
              sizes="8rem"
              src={accentLeft720}
              srcSet={`${accentLeft480} 480w, ${accentLeft720} 720w`}
            />
          </div>
          <div className="absolute top-0 right-0 hidden h-32 w-32 opacity-20 lg:block">
            <img
              alt=""
              className="h-full w-full object-contain"
              sizes="8rem"
              src={accentRight720}
              srcSet={`${accentRight480} 480w, ${accentRight720} 720w`}
            />
          </div>

          <div className="mb-6 inline-block rounded-full bg-[#5eb3b8]/10 px-5 py-2">
            <span className="font-medium text-[#5eb3b8]">{t.features.badge}</span>
          </div>

          <h2 className="mb-4 text-4xl font-bold text-[#1a2b2e] lg:text-5xl">{t.features.title}</h2>
          <p className="mx-auto max-w-3xl text-xl text-[#6b8284]">{t.features.description}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <div
                className="group rounded-2xl border-2 border-[#5eb3b8]/20 bg-white p-6 transition-all hover:border-[#5eb3b8] hover:shadow-xl"
                key={feature.title}
              >
                <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${feature.bgColor} transition-transform group-hover:scale-110`}>
                  <Icon className={feature.color} size={28} />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-[#1a2b2e]">{feature.title}</h3>
                <p className="leading-relaxed text-[#6b8284]">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
