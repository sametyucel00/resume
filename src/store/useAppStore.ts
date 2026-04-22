import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CreditAction, CreditTransaction, Cv, HistoryItem, LocalData, Profile, Settings } from "../types";
import { defaultData, LOCAL_DATA_VERSION } from "../data/defaults";
import { getCreditCost } from "../services/credits";
import { preserveUtf8, shortId } from "../utils/text";

type AppState = LocalData & {
  activeCvId: string;
  hydrated: boolean;
  setHydrated: (hydrated: boolean) => void;
  setActiveCvId: (id: string) => void;
  updateProfile: (profile: Partial<Profile>) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updateCv: (cv: Cv) => void;
  createCv: (name?: string) => Cv;
  duplicateCv: (id: string) => void;
  deleteCv: (id: string) => void;
  addCvFromText: (name: string, text: string) => Cv;
  addHistory: (item: Omit<HistoryItem, "id" | "createdAt">) => void;
  spendCredit: (action: CreditAction, note: string) => boolean;
  restoreCredits: (credits: number, action?: CreditAction, note?: string) => void;
  getCreditBalance: () => number;
  canAfford: (action: CreditAction) => boolean;
  importLocalData: (data: Partial<LocalData>, mode?: "merge" | "replace") => void;
  resetLocalData: () => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...defaultData,
      activeCvId: defaultData.cvs[0].id,
      hydrated: false,
      setHydrated: (hydrated) => set({ hydrated }),
      setActiveCvId: (id) => set({ activeCvId: id }),
      updateProfile: (profile) => set((state) => ({ profile: normalizeProfile({ ...state.profile, ...profile }) })),
      updateSettings: (settings) => set((state) => ({ settings: normalizeSettings({ ...state.settings, ...settings }) })),
      updateCv: (cv) =>
        set((state) => ({
          cvs: state.cvs.map((item) => (item.id === cv.id ? normalizeCv({ ...cv, updatedAt: new Date().toISOString() }) : item))
        })),
      createCv: (name) => {
        const defaultName = get().settings.language === "tr" ? "Yeni Özgeçmiş" : "New CV";
        const cv = normalizeCv({ ...defaultData.cvs[0], id: shortId("cv"), name: name ?? defaultName, rawText: "", summary: "", skills: [], experience: [], education: [], updatedAt: new Date().toISOString() });
        set((state) => ({ cvs: [cv, ...state.cvs], activeCvId: cv.id }));
        return cv;
      },
      duplicateCv: (id) =>
        set((state) => {
          const source = state.cvs.find((cv) => cv.id === id) ?? state.cvs[0];
          const suffix = state.settings.language === "tr" ? "Kopya" : "Copy";
          const copy = normalizeCv({ ...source, id: shortId("cv"), name: `${source.name} ${suffix}`, updatedAt: new Date().toISOString() });
          return { cvs: [copy, ...state.cvs], activeCvId: copy.id };
        }),
      deleteCv: (id) =>
        set((state) => {
          const remaining = state.cvs.filter((cv) => cv.id !== id);
          const cvs = remaining.length ? remaining : [normalizeCv({ ...defaultData.cvs[0], id: shortId("cv") })];
          return { cvs, activeCvId: cvs[0].id };
        }),
      addCvFromText: (name, text) => {
        const normalized = preserveUtf8(text);
        const cv: Cv = normalizeCv({
          id: shortId("cv"),
          name: preserveUtf8(name),
          summary: "",
          skills: [],
          experience: [],
          education: [],
          rawText: normalized,
          templateId: "ats-balanced",
          spacingId: "balanced",
          mode: "ats",
          sectionOrder: ["summary", "skills", "experience", "education"],
          updatedAt: new Date().toISOString()
        });
        set((state) => ({ cvs: [cv, ...state.cvs], activeCvId: cv.id }));
        return cv;
      },
      addHistory: (item) =>
        set((state) => ({
          history: [
            { ...item, id: shortId("history"), createdAt: new Date().toISOString() },
            ...state.history
          ].slice(0, 40)
        })),
      spendCredit: (action, note) => {
        const cost = getCreditCost(action);
        const credits = get().settings.credits;
        if (credits < cost) return false;
        set((state) => ({
          settings: { ...state.settings, credits: state.settings.credits - cost },
          creditTransactions: [
            { id: shortId("credit"), action, amount: -cost, createdAt: new Date().toISOString(), note },
            ...state.creditTransactions
          ].slice(0, 60)
        }));
        return true;
      },
      restoreCredits: (credits, action = "restore", note = "Credits restored") =>
        set((state) => {
          const nextBalance = Math.max(state.settings.credits, credits);
          const delta = Math.max(0, nextBalance - state.settings.credits);
          return {
            settings: { ...state.settings, credits: nextBalance },
            creditTransactions: delta
              ? [
                  { id: shortId("credit"), action, amount: delta, createdAt: new Date().toISOString(), note },
                  ...state.creditTransactions
                ].slice(0, 60)
              : state.creditTransactions
          };
        }),
      getCreditBalance: () => get().settings.credits,
      canAfford: (action) => get().settings.credits >= getCreditCost(action),
      importLocalData: (data, mode = "merge") =>
        set((state) => {
          const base = mode === "replace" ? { ...state, ...defaultData, activeCvId: defaultData.cvs[0].id } : state;
          const cvs = Array.isArray(data.cvs) && data.cvs.length ? data.cvs.map(normalizeCv) : base.cvs.map(normalizeCv);
          return {
            localDataVersion: LOCAL_DATA_VERSION,
            profile: normalizeProfile({ ...base.profile, ...(data.profile ?? {}) }),
            cvs,
            history: Array.isArray(data.history) ? data.history.slice(0, 40) : base.history,
            creditTransactions: Array.isArray(data.creditTransactions) ? data.creditTransactions.slice(0, 60) : base.creditTransactions,
            settings: normalizeSettings({ ...base.settings, ...(data.settings ?? {}) }),
            activeCvId: cvs[0]?.id ?? base.activeCvId
          };
        }),
      resetLocalData: () => set({ ...defaultData, activeCvId: defaultData.cvs[0].id })
    }),
    {
      name: "cv-optimizer-ai-local-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        localDataVersion: state.localDataVersion,
        profile: state.profile,
        cvs: state.cvs,
        history: state.history,
        creditTransactions: state.creditTransactions,
        settings: state.settings,
        activeCvId: state.activeCvId
      }),
      version: LOCAL_DATA_VERSION,
      migrate: (persisted) => migrateLocalData(persisted as Partial<AppState>),
      onRehydrateStorage: () => (state, error) => {
        if (error) void AsyncStorage.removeItem("cv-optimizer-ai-local-v1");
        state?.setHydrated(true);
      }
    }
  )
);

export const selectActiveCv = (state: AppState) =>
  state.cvs.find((cv) => cv.id === state.activeCvId) ?? state.cvs[0];

function migrateLocalData(persisted: Partial<AppState>): Partial<AppState> {
  const persistedSettings = (persisted.settings ?? {}) as Partial<Settings>;
  const language = persistedSettings.language === "en" || persistedSettings.language === "tr" ? persistedSettings.language : defaultData.settings.language;
  const aiDataConsent = typeof persistedSettings.aiDataConsent === "boolean" ? persistedSettings.aiDataConsent : null;
  return {
    ...defaultData,
    ...persisted,
    localDataVersion: LOCAL_DATA_VERSION,
    profile: normalizeProfile({ ...defaultData.profile, ...(persisted.profile ?? {}) }),
    cvs: Array.isArray(persisted.cvs) && persisted.cvs.length ? persisted.cvs.map(normalizeCv) : defaultData.cvs,
    history: Array.isArray(persisted.history) ? persisted.history.slice(0, 40) : [],
    creditTransactions: Array.isArray(persisted.creditTransactions) ? persisted.creditTransactions.slice(0, 60) : [],
    settings: normalizeSettings({
      ...defaultData.settings,
      ...persistedSettings,
      language,
      onboardingSeen: Boolean(persistedSettings.onboardingSeen),
      aiDataConsent
    }),
    activeCvId: persisted.activeCvId ?? persisted.cvs?.[0]?.id ?? defaultData.cvs[0].id
  };
}

function normalizeProfile(profile: Profile): Profile {
  return {
    ...profile,
    fullName: preserveUtf8(profile.fullName),
    title: preserveUtf8(profile.title),
    location: preserveUtf8(profile.location),
    email: preserveUtf8(profile.email),
    phone: preserveUtf8(profile.phone),
    links: preserveUtf8(profile.links),
    summary: preserveUtf8(profile.summary),
    skills: Array.isArray(profile.skills) ? profile.skills.map((skill) => preserveUtf8(skill)).filter(Boolean) : []
  };
}

function normalizeSettings(settings: Settings): Settings {
  return {
    ...settings,
    apiBaseUrl: preserveUtf8(settings.apiBaseUrl),
    lastJobDescription: preserveUtf8(settings.lastJobDescription),
    language: settings.language === "en" || settings.language === "tr" ? settings.language : defaultData.settings.language,
    aiDataConsent: typeof settings.aiDataConsent === "boolean" ? settings.aiDataConsent : null,
    onboardingSeen: Boolean(settings.onboardingSeen)
  };
}

function normalizeCv(cv: Cv): Cv {
  const incomingTemplateId = String(cv.templateId ?? "");
  const templateId = incomingTemplateId === "human-elegant" ? "human-focus" : incomingTemplateId;
  const spacingId = cv.spacingId === "compact" || cv.spacingId === "balanced" || cv.spacingId === "spacious" ? cv.spacingId : defaultData.cvs[0].spacingId;
  return {
    ...cv,
    name: preserveUtf8(cv.name),
    summary: preserveUtf8(cv.summary),
    skills: Array.isArray(cv.skills) ? cv.skills.map((skill) => preserveUtf8(skill)).filter(Boolean) : [],
    experience: Array.isArray(cv.experience)
      ? cv.experience.map((item) => ({
          ...item,
          company: preserveUtf8(item.company),
          role: preserveUtf8(item.role),
          period: preserveUtf8(item.period),
          bullets: Array.isArray(item.bullets) ? item.bullets.map((bullet) => preserveUtf8(bullet)).filter(Boolean) : []
        }))
      : [],
    education: Array.isArray(cv.education)
      ? cv.education.map((item) => ({
          ...item,
          school: preserveUtf8(item.school),
          degree: preserveUtf8(item.degree),
          period: preserveUtf8(item.period)
        }))
      : [],
    rawText: preserveUtf8(cv.rawText),
    templateId: templateId === "ats-compact" || templateId === "ats-balanced" || templateId === "ats-spacious" || templateId === "human-focus" ? templateId : defaultData.cvs[0].templateId,
    spacingId,
    sectionOrder: Array.isArray(cv.sectionOrder) && cv.sectionOrder.length ? cv.sectionOrder : ["summary", "skills", "experience", "education"]
  };
}
