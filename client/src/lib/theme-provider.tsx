import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "./firebase";
import { doc, updateDoc, getDoc } from "firebase/firestore";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme");
    return (stored === "dark" ? "dark" : "light") as Theme;
  });

  const { user } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Sync from Firestore on Login
  useEffect(() => {
    if (!user) return;
    
    let active = true;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (!active) return;
        if (snap.exists()) {
          const cloudTheme = snap.data().settings?.theme;
          if (cloudTheme && cloudTheme !== theme) {
            setTheme(cloudTheme as Theme);
          }
        }
      })
      .catch((e) => {
        console.error("Failed to sync theme:", e);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const toggleTheme = async () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    
    if (user) {
      try {
        await updateDoc(doc(db, "users", user.uid), {
          "settings.theme": newTheme
        });
      } catch (e) {
        console.error("Failed to sync theme:", e);
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
