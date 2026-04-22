import { Cv, LocalData, Profile, Settings } from "../types";
import { embeddedApiBaseUrl } from "../config/runtime";

export const LOCAL_DATA_VERSION = 1;

export const emptyProfile: Profile = {
  fullName: "",
  title: "",
  location: "",
  email: "",
  phone: "",
  links: "",
  summary: "",
  skills: []
};

export const starterCv: Cv = {
  id: "cv_default",
  name: "Primary CV",
  summary: "",
  skills: [],
  experience: [],
  education: [],
  rawText: "",
  templateId: "ats-balanced",
  mode: "ats",
  sectionOrder: ["summary", "skills", "experience", "education"],
  updatedAt: new Date().toISOString()
};

export const defaultSettings: Settings = {
  apiBaseUrl: embeddedApiBaseUrl || "http://localhost:8787",
  aiProvider: "groq",
  tone: "direct",
  credits: 12,
  lastJobDescription: ""
};

export const defaultData: LocalData = {
  localDataVersion: LOCAL_DATA_VERSION,
  profile: emptyProfile,
  cvs: [starterCv],
  history: [],
  creditTransactions: [],
  settings: defaultSettings
};
