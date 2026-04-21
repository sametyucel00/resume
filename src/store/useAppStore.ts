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
      updateProfile: (profile) => set((state) => ({ profile: { ...state.profile, ...profile } })),
      updateSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
      updateCv: (cv) =>
        set((state) => ({
          cvs: state.cvs.map((item) => (item.id === cv.id ? normalizeCv({ ...cv, updatedAt: new Date().toISOString() }) : item))
        })),
      createCv: (name = "New CV") => {
        const cv = normalizeCv({ ...defaultData.cvs[0], id: shortId("cv"), name, rawText: "", summary: "", skills: [], experience: [], education: [], updatedAt: new Date().toISOString() });
        set((state) => ({ cvs: [cv, ...state.cvs], activeCvId: cv.id }));
        return cv;
      },
      duplicateCv: (id) =>
        set((state) => {
          const source = state.cvs.find((cv) => cv.id === id) ?? state.cvs[0];
          const copy = normalizeCv({ ...source, id: shortId("cv"), name: `${source.name} Copy`, updatedAt: new Date().toISOString() });
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
          name,
          summary: "",
          skills: [],
          experience: [],
          education: [],
          rawText: normalized,
          templateId: "ats-balanced",
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
        set((state) => ({
          settings: { ...state.settings, credits: Math.max(state.settings.credits, credits) },
          creditTransactions: [
            { id: shortId("credit"), action, amount: credits, createdAt: new Date().toISOString(), note },
            ...state.creditTransactions
          ].slice(0, 60)
        })),
      getCreditBalance: () => get().settings.credits,
      canAfford: (action) => get().settings.credits >= getCreditCost(action),
      importLocalData: (data, mode = "merge") =>
        set((state) => {
          const base = mode === "replace" ? { ...state, ...defaultData, activeCvId: defaultData.cvs[0].id } : state;
          const cvs = Array.isArray(data.cvs) && data.cvs.length ? data.cvs.map(normalizeCv) : base.cvs.map(normalizeCv);
          return {
            localDataVersion: LOCAL_DATA_VERSION,
            profile: { ...base.profile, ...(data.profile ?? {}) },
            cvs,
            history: Array.isArray(data.history) ? data.history.slice(0, 40) : base.history,
            creditTransactions: Array.isArray(data.creditTransactions) ? data.creditTransactions.slice(0, 60) : base.creditTransactions,
            settings: { ...base.settings, ...(data.settings ?? {}) },
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
  return {
    ...defaultData,
    ...persisted,
    localDataVersion: LOCAL_DATA_VERSION,
    profile: { ...defaultData.profile, ...(persisted.profile ?? {}) },
    cvs: Array.isArray(persisted.cvs) && persisted.cvs.length ? persisted.cvs.map(normalizeCv) : defaultData.cvs,
    history: Array.isArray(persisted.history) ? persisted.history.slice(0, 40) : [],
    creditTransactions: Array.isArray(persisted.creditTransactions) ? persisted.creditTransactions.slice(0, 60) : [],
    settings: { ...defaultData.settings, ...(persisted.settings ?? {}) },
    activeCvId: persisted.activeCvId ?? persisted.cvs?.[0]?.id ?? defaultData.cvs[0].id
  };
}

function normalizeCv(cv: Cv): Cv {
  return {
    ...cv,
    sectionOrder: Array.isArray(cv.sectionOrder) && cv.sectionOrder.length ? cv.sectionOrder : ["summary", "skills", "experience", "education"]
  };
}
