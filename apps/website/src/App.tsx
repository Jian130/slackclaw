import { Features } from "./components/Features.js";
import { Footer } from "./components/Footer.js";
import { Hero } from "./components/Hero.js";
import { HowItWorks } from "./components/HowItWorks.js";
import { MascotShowcase } from "./components/MascotShowcase.js";
import { Navigation } from "./components/Navigation.js";
import { OpenSource } from "./components/OpenSource.js";
import { ProductPreview } from "./components/ProductPreview.js";
import { LanguageProvider } from "./i18n/LanguageContext.js";

export default function App() {
  return (
    <LanguageProvider>
      <div className="min-h-screen bg-background">
        <Navigation />
        <Hero />
        <Features />
        <ProductPreview />
        <HowItWorks />
        <MascotShowcase />
        <OpenSource />
        <Footer />
      </div>
    </LanguageProvider>
  );
}
