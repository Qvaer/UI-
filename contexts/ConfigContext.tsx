
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { translations, Language } from '../utils/i18n';

type Theme = 'dark' | 'light';

interface ConfigContextType {
  theme: Theme;
  language: Language;
  volcengineApiKey: string;
  volcengineModelId: string;
  toggleTheme: () => void;
  setLanguage: (lang: Language) => void;
  setVolcengineApiKey: (key: string) => void;
  setVolcengineModelId: (id: string) => void;
  t: (path: string) => string;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('dark');
  const [language, setLanguage] = useState<Language>('zh');
  
  // Initialize with default values or from localStorage if available
  const [volcengineApiKey, setVolcengineApiKey] = useState<string>(() => {
      return localStorage.getItem('volcengine_api_key') || "99221f7b-b247-4f06-8509-f82db3204872";
  });
  const [volcengineModelId, setVolcengineModelId] = useState<string>(() => {
      return localStorage.getItem('volcengine_model_id') || "ep-m-20260303165808-5gpw8";
  });

  // Persist to localStorage whenever they change
  useEffect(() => {
      localStorage.setItem('volcengine_api_key', volcengineApiKey);
  }, [volcengineApiKey]);

  useEffect(() => {
      localStorage.setItem('volcengine_model_id', volcengineModelId);
  }, [volcengineModelId]);

  // Handle Theme Logic
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const setLanguageCallback = useCallback((lang: Language) => {
    setLanguage(lang);
  }, []);

  // Helper function to get nested translation value
  // Memoized so it only changes when language changes
  const t = useCallback((path: string): string => {
    const keys = path.split('.');
    let current: any = translations[language];
    for (const key of keys) {
      if (current[key] === undefined) return path;
      current = current[key];
    }
    return current as string;
  }, [language]);

  const value = useMemo(() => ({
    theme, 
    language, 
    volcengineApiKey,
    volcengineModelId,
    toggleTheme, 
    setLanguage: setLanguageCallback, 
    setVolcengineApiKey,
    setVolcengineModelId,
    t
  }), [theme, language, volcengineApiKey, volcengineModelId, toggleTheme, setLanguageCallback, t]);

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};
