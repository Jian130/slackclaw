import { Architecture } from "./components/Architecture.js";
import { CTA } from "./components/CTA.js";
import { Features } from "./components/Features.js";
import { Footer } from "./components/Footer.js";
import { Hero } from "./components/Hero.js";
import { Navigation } from "./components/Navigation.js";
import { OpenSource } from "./components/OpenSource.js";
import { LanguageProvider } from "./i18n/LanguageContext.js";

export default function App() {
  return (
    <LanguageProvider>
      <div className="min-h-screen bg-background">
        <Navigation />
        <Hero />
        <Features />
        <Architecture />
        <OpenSource />
        <CTA />
        <Footer />
      </div>
    </LanguageProvider>
  );
}
