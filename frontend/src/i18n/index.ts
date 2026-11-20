import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en";
import kn from "./kn";

export const LANGS = [
  { code: "en", label: "English", native: "English" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
export const langName = (c: string) => LANGS.find((l) => l.code === c)?.native ?? c;
export const langEnglishName = (c: string) => LANGS.find((l) => l.code === c)?.label ?? c;


i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, kn: { translation: kn } },
  lng: "en", // screen language is English; the question language is chosen next to the microphone
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

const setHtmlLang = (l: string) => { document.documentElement.lang = l; };
setHtmlLang(i18n.language);
i18n.on("languageChanged", setHtmlLang);

export default i18n;
