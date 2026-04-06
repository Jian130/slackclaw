import { Code, GitFork, Github, Heart, Star, Users } from "lucide-react";

import { figmaAssets } from "../assets/figmaAssets.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { websiteLinks } from "../links.js";

const repoStats = {
  contributors: 2,
  forks: 0,
  license: "Apache-2.0",
  stars: 1
} as const;

export function OpenSource() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden bg-[#2D2D2D] py-24 text-white" id="open-source">
      <div
        className="absolute inset-0 opacity-5"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "40px 40px" }}
      />
      <div className="absolute top-1/4 right-1/4 h-96 w-96 rounded-full bg-[#FF6A3D] opacity-10 blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 h-80 w-80 rounded-full bg-[#FF8866] opacity-10 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <div className="mb-6 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-5 py-2.5 backdrop-blur-sm">
            <Code className="mr-2 text-[#FF6A3D]" size={16} />
            <span className="font-semibold">{t.openSource.badge}</span>
          </div>

          <h2 className="mb-6 text-4xl font-bold lg:text-5xl">
            {t.openSource.titleLead} <span className="text-[#FF6A3D]">{t.openSource.titleAccent}</span>
          </h2>
          <p className="mx-auto max-w-3xl text-xl leading-relaxed text-white/80">{t.openSource.description}</p>
        </div>

        <div className="mb-16 grid gap-8 lg:grid-cols-3">
          <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:border-[#FF6A3D]/50 hover:bg-white/10">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF6A3D] to-[#FF8866] shadow-xl">
              <Code size={32} />
            </div>
            <h3 className="mb-3 text-2xl font-bold">{t.openSource.feature1}</h3>
            <p className="leading-relaxed text-white/70">{t.openSource.feature1Desc}</p>
          </div>

          <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:border-[#FF6A3D]/50 hover:bg-white/10">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF8866] to-[#FFA07A] shadow-xl">
              <Users size={32} />
            </div>
            <h3 className="mb-3 text-2xl font-bold">{t.openSource.feature2}</h3>
            <p className="leading-relaxed text-white/70">{t.openSource.feature2Desc}</p>
          </div>

          <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:border-[#FF6A3D]/50 hover:bg-white/10">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF6A3D] to-[#E55A2F] shadow-xl">
              <Heart size={32} />
            </div>
            <h3 className="mb-3 text-2xl font-bold">{t.openSource.feature3}</h3>
            <p className="leading-relaxed text-white/70">{t.openSource.feature3Desc}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border-2 border-white/20 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md">
          <div className="grid items-center gap-12 p-8 lg:grid-cols-2 lg:p-12">
            <div>
              <h3 className="mb-6 text-3xl font-bold lg:text-4xl">{t.openSource.communityTitle}</h3>
              <p className="mb-8 text-lg leading-relaxed text-white/80">{t.openSource.communityDescription}</p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <a
                  className="inline-flex items-center justify-center rounded-2xl bg-white/90 px-8 py-4 text-lg font-semibold text-[#2D2D2D] shadow-[0_8px_32px_rgba(255,255,255,0.2)] transition-all hover:-translate-y-0.5 hover:bg-white"
                  href={websiteLinks.repository}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Github className="mr-2" size={22} />
                  {t.openSource.viewSource}
                </a>
                <a
                  className="inline-flex items-center justify-center rounded-2xl border-2 border-white/40 bg-white/10 px-8 py-4 text-lg font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition-all hover:-translate-y-0.5 hover:bg-white/20"
                  href={websiteLinks.stargazers}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Star className="mr-2" size={22} />
                  {t.openSource.starOnGithub}
                </a>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Star className="text-[#FF6A3D]" size={20} />
                    <span className="text-2xl font-bold">{repoStats.stars}</span>
                  </div>
                  <div className="text-sm text-white/60">{t.openSource.starsLabel}</div>
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <GitFork className="text-[#FF8866]" size={20} />
                    <span className="text-2xl font-bold">{repoStats.forks}</span>
                  </div>
                  <div className="text-sm text-white/60">{t.openSource.forksLabel}</div>
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Users className="text-[#FF6A3D]" size={20} />
                    <span className="text-2xl font-bold">{repoStats.contributors}</span>
                  </div>
                  <div className="text-sm text-white/60">{t.openSource.contributorsLabel}</div>
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Heart className="fill-[#FF8866] text-[#FF8866]" size={20} />
                    <span className="text-2xl font-bold">{repoStats.license}</span>
                  </div>
                  <div className="text-sm text-white/60">{t.openSource.licenseLabel}</div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#FF6A3D] to-[#FF8866] opacity-20 blur-2xl" />
              <div className="relative flex aspect-square items-center justify-center rounded-3xl border border-white/20 bg-white/5 p-8 backdrop-blur-sm">
                <img alt="ChillClaw Mini Claw builder mode" className="h-full w-full object-contain" src={figmaAssets.builderMascot} />
              </div>
              <div className="absolute -right-4 -bottom-4 rounded-xl bg-[#FF6A3D] px-4 py-2 font-mono text-sm font-bold shadow-xl">{'<ChillClaw />'}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
