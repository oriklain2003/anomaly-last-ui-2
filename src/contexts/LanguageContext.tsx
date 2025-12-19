import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type Language = 'en' | 'he';
export type AnalystLanguageSetting = 'auto' | 'en' | 'he';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    isHebrew: boolean;
    dir: 'ltr' | 'rtl';
    
    analystLanguageSetting: AnalystLanguageSetting;
    setAnalystLanguageSetting: (lang: AnalystLanguageSetting) => void;
    analystLanguage: Language;
    isHebrewAnalyst: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { i18n } = useTranslation();
    const [analystLanguageSetting, setAnalystLanguageSettingState] = useState<AnalystLanguageSetting>(() => {
        const saved = localStorage.getItem('analystLanguageSetting');
        return (saved === 'auto' || saved === 'en' || saved === 'he') ? (saved as AnalystLanguageSetting) : 'auto';
    });
    
    // Normalize language to 'en' or 'he'
    const currentLang = i18n.language || 'en';
    const language: Language = (currentLang === 'he' || currentLang.startsWith('he')) ? 'he' : 'en';
    
    const isHebrew = language === 'he';
    const dir = isHebrew ? 'rtl' : 'ltr';

    // Resolve effective analyst language
    const analystLanguage: Language = analystLanguageSetting === 'auto' ? language : analystLanguageSetting;
    const isHebrewAnalyst = analystLanguage === 'he';

    const setLanguage = (lang: Language) => {
        i18n.changeLanguage(lang);
    };

    const setAnalystLanguageSetting = (lang: AnalystLanguageSetting) => {
        setAnalystLanguageSettingState(lang);
        localStorage.setItem('analystLanguageSetting', lang);
    };
    
    // Update document direction and language attributes
    useEffect(() => {
        document.documentElement.dir = dir;
        document.documentElement.lang = language;
    }, [dir, language]);

    return (
        <LanguageContext.Provider value={{ 
            language, 
            setLanguage, 
            isHebrew, 
            dir,
            analystLanguageSetting,
            setAnalystLanguageSetting,
            analystLanguage,
            isHebrewAnalyst
        }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
