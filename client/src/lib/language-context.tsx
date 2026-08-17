import React, { createContext, useContext, useState, useEffect } from "react";
import { translations, Language, TranslationKey } from "./i18n";
import { useAuth } from "@/lib/auth-context";
import { db } from "./firebase";
import { doc, updateDoc, getDoc } from "firebase/firestore";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, any>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>("en");

  // Sync with Firestore user profile
  useEffect(() => {
    if (!user) return;
    
    let active = true;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data();
          if (data.settings?.language) {
            setLanguageState(data.settings.language);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to fetch user language setting:", err);
      });
      
    return () => {
      active = false;
    };
  }, [user]);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    if (user) {
      try {
        await updateDoc(doc(db, "users", user.uid), {
          "settings.language": lang
        });
      } catch (err) {
        console.error("Failed to update language in Firestore:", err);
      }
    }
  };

  const t = (key: TranslationKey, params?: Record<string, any>) => {
    let text = translations[language][key] || translations["en"][key] || key;
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return context;
}
