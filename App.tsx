import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, ImageStyle, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, EmptyState, Field, Screen, Section, Segmented, Skeleton, Title, colors } from "./src/components/ui";
import * as Clipboard from "expo-clipboard";
import { pickJsonBackup } from "./src/services/backup";
import { estimateCvParseConfidence, parseRawCvText } from "./src/services/cvParser";
import { AiResult, generateAIResult } from "./src/services/ai";
import { copyTextExport, exportPdf, exportText } from "./src/services/exporter";
import { pickCvDocument } from "./src/services/importer";
import { creditProducts, ProductId, purchaseCredits, restorePurchases } from "./src/services/purchases";
import { getTemplatePreset, templates } from "./src/services/templates";
import { selectActiveCv, useAppStore } from "./src/store/useAppStore";
import { AiTask, AppLanguage, AtsReport, Cv, CvMode, CvSectionId, HistoryItem, InterviewCategory, InterviewPack, JobAnalysis, OptimizedCvDraft, Profile, SpacingId, TemplateId } from "./src/types";
import { parseLooseJson } from "./src/utils/json";
import { clamp, splitCsv, splitLines, shortId, TURKISH_LOCALE } from "./src/utils/text";
import { resolveApiBaseUrl } from "./src/config/runtime";
import { t, tf } from "./src/i18n";

type Step = "profile" | "cv" | "bullets" | "job" | "optimize" | "ats" | "export" | "interview" | "history" | "settings";
type ApplyScope = "all" | "summary" | "skills" | "bullets";

const hirviaIcon = require("./assets/branding/hirvia-icon-final.png");

function getSteps(language: AppLanguage): { id: Step; label: string; title: string; marker: string }[] {
  return [
    { id: "profile", label: t(language, "step_profile"), title: t(language, "profile_title"), marker: language === "tr" ? "B" : "P" },
    { id: "cv", label: t(language, "step_cv"), title: t(language, "cv_title"), marker: language === "tr" ? "Ö" : "C" },
    { id: "bullets", label: t(language, "step_edit"), title: t(language, "bullets_title"), marker: language === "tr" ? "D" : "B" },
    { id: "job", label: t(language, "step_job"), title: t(language, "job_title"), marker: language === "tr" ? "İ" : "J" },
    { id: "optimize", label: t(language, "step_draft"), title: t(language, "optimize_title"), marker: language === "tr" ? "T" : "O" },
    { id: "ats", label: t(language, "step_ats"), title: t(language, "ats_title"), marker: "A" },
    { id: "export", label: t(language, "step_export"), title: t(language, "export_title"), marker: language === "tr" ? "D" : "E" },
    { id: "interview", label: t(language, "step_prep"), title: t(language, "interview_title"), marker: language === "tr" ? "H" : "I" },
    { id: "history", label: t(language, "step_history"), title: t(language, "history_title"), marker: language === "tr" ? "G" : "L" },
    { id: "settings", label: t(language, "step_settings"), title: t(language, "settings_title"), marker: language === "tr" ? "A" : "S" }
  ];
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <AppShell />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "Unexpected runtime error"
    };
  }

  componentDidCatch(error: Error) {
    console.error("app.runtime.error", error);
  }

  retry = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const language = useAppStore.getState().settings.language;
    return (
      <SafeAreaView style={styles.safe}>
        <Screen>
          <Section>
            <Title title={t(language, "app_error_title")} subtitle={t(language, "app_error_subtitle")} />
            <View style={styles.brandCard}>
              <BrandLockup variant="panel" />
            </View>
            <View style={styles.runtimeErrorBox}>
              <Text style={styles.runtimeErrorTitle}>{t(language, "runtime_message")}</Text>
              <Text style={styles.runtimeErrorText}>{this.state.message}</Text>
            </View>
            <View style={[styles.actions, styles.actionsCompact]}>
              <Button label={t(language, "retry_app")} onPress={this.retry} />
            </View>
          </Section>
        </Screen>
      </SafeAreaView>
    );
  }
}

function AppShell() {
  const [step, setStep] = useState<Step>("profile");
  const [splashDone, setSplashDone] = useState(false);
  const hydrated = useAppStore((state) => state.hydrated);
  const language = useAppStore((state) => state.settings.language);
  const onboardingSeen = useAppStore((state) => state.settings.onboardingSeen);
  const aiDataConsent = useAppStore((state) => state.settings.aiDataConsent);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), 1050);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [step]);

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen>
          <Section>
            <BrandLockup variant="loading" />
            <Title title="Hirvia" subtitle={t(language, "loading_workspace")} />
            <Skeleton lines={5} />
          </Section>
        </Screen>
      </SafeAreaView>
    );
  }

  if (!splashDone) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen>
          <SplashScreen />
        </Screen>
      </SafeAreaView>
    );
  }

  if (!onboardingSeen) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen>
          <OnboardingScreen />
        </Screen>
      </SafeAreaView>
    );
  }

  if (aiDataConsent === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen>
          <ConsentGate />
        </Screen>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Screen>
        <View style={[styles.shell, styles.shellCompact]}>
          <ScrollView ref={scrollRef} style={styles.scrollArea} contentContainerStyle={[styles.content, styles.contentCompact, styles.contentCompactTight]} keyboardShouldPersistTaps="handled">
            <Header step={step} />
            {step === "profile" && <ProfileScreen next={() => setStep("cv")} />}
            {step === "cv" && <CvScreen next={() => setStep("bullets")} />}
            {step === "bullets" && <BulletScreen next={() => setStep("job")} />}
            {step === "job" && <JobScreen next={() => setStep("optimize")} />}
            {step === "optimize" && <OptimizeScreen next={() => setStep("ats")} />}
            {step === "ats" && <AtsScreen next={() => setStep("export")} />}
            {step === "export" && <ExportScreen next={() => setStep("interview")} />}
            {step === "interview" && <InterviewScreen />}
            {step === "history" && <HistoryScreen />}
            {step === "settings" && <SettingsScreen />}
          </ScrollView>
          <Sidebar active={step} onChange={setStep} bottomInset={Math.max(insets.bottom, 8)} />
        </View>
      </Screen>
    </SafeAreaView>
  );
}

function SplashScreen() {
  const language = useAppStore((state) => state.settings.language);
  return (
    <Section style={styles.splashSection}>
      <View style={styles.splashMark}>
        <Image source={hirviaIcon} style={styles.splashIcon as ImageStyle} resizeMode="contain" />
      </View>
      <Text style={styles.splashName}>Hirvia</Text>
      <Text style={styles.splashSubtitle}>{t(language, "splash_subtitle")}</Text>
      <View style={styles.splashProgress}>
        <View style={styles.splashProgressFill} />
      </View>
    </Section>
  );
}

function OnboardingScreen() {
  const language = useAppStore((state) => state.settings.language);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const items = [
    { title: t(language, "onboarding_step_1_title"), body: t(language, "onboarding_step_1_body") },
    { title: t(language, "onboarding_step_2_title"), body: t(language, "onboarding_step_2_body") },
    { title: t(language, "onboarding_step_3_title"), body: t(language, "onboarding_step_3_body") }
  ];

  return (
    <ScrollView contentContainerStyle={styles.onboardingScroll} keyboardShouldPersistTaps="handled">
      <Section style={styles.onboardingSection}>
        <BrandLockup variant="loading" />
        <Title title={t(language, "onboarding_title")} subtitle={t(language, "onboarding_subtitle")} />
        <View style={styles.onboardingList}>
          {items.map((item, index) => (
            <View key={item.title} style={styles.onboardingItem}>
              <View style={styles.onboardingIndex}>
                <Text style={styles.onboardingIndexText}>{index + 1}</Text>
              </View>
              <View style={styles.onboardingCopy}>
                <Text style={styles.onboardingItemTitle}>{item.title}</Text>
                <Text style={styles.onboardingItemBody}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.infoPanelSoft}>
          <Text style={styles.infoText}>{t(language, "onboarding_privacy_note")}</Text>
        </View>
        <ActionRow>
          <Button label={t(language, "onboarding_start")} onPress={() => updateSettings({ onboardingSeen: true })} />
        </ActionRow>
      </Section>
    </ScrollView>
  );
}

function ConsentGate() {
  const language = useAppStore((state) => state.settings.language);
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <Section style={styles.consentSection}>
      <BrandLockup variant="loading" />
      <Title title={t(language, "ai_consent_title")} subtitle={t(language, "ai_consent_subtitle")} />
      <View style={styles.infoPanel}>
        <Text style={styles.infoText}>{t(language, "ai_consent_detail")}</Text>
      </View>
      <View style={styles.infoPanelSoft}>
        <Text style={styles.previewLabel}>{t(language, "privacy_policy")} / {t(language, "terms_of_use")}</Text>
        <Text style={styles.infoText}>{buildLegalUrl("privacy")}</Text>
        <Text style={styles.infoText}>{buildLegalUrl("terms")}</Text>
      </View>
      <ActionRow>
        <Button label={t(language, "open_privacy")} onPress={() => void openLegalUrl("privacy")} variant="secondary" />
        <Button label={t(language, "open_terms")} onPress={() => void openLegalUrl("terms")} variant="secondary" />
      </ActionRow>
      <ActionRow>
        <Button label={t(language, "ai_consent_allow")} onPress={() => updateSettings({ aiDataConsent: true })} />
        <Button label={t(language, "ai_consent_deny")} onPress={() => updateSettings({ aiDataConsent: false })} variant="secondary" />
      </ActionRow>
    </Section>
  );
}

function Header({ step }: { step: Step }) {
  const credits = useAppStore((state) => state.settings.credits);
  const language = useAppStore((state) => state.settings.language);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const steps = useMemo(() => getSteps(language), [language]);
  return (
    <View style={[styles.header, styles.headerCompact]}>
      <View style={styles.headerTopRow}>
        <View style={styles.headerTextWrap}>
          <BrandLockup variant="header" />
        </View>
        <View style={styles.headerControls}>
          <View style={styles.languageSwitch}>
            <Pressable onPress={() => updateSettings({ language: "tr" })} style={[styles.languageChip, language === "tr" && styles.languageChipActive]}>
              <Text style={[styles.languageChipText, language === "tr" && styles.languageChipTextActive]}>TR</Text>
            </Pressable>
            <Pressable onPress={() => updateSettings({ language: "en" })} style={[styles.languageChip, language === "en" && styles.languageChipActive]}>
              <Text style={[styles.languageChipText, language === "en" && styles.languageChipTextActive]}>EN</Text>
            </Pressable>
          </View>
          <View style={[styles.creditPill, credits <= 0 && styles.creditPillEmpty]}>
            <Text style={[styles.creditText, credits <= 0 && styles.creditTextEmpty]}>{credits} {language === "tr" ? "Kredi" : "credits"}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Sidebar({ active, onChange, bottomInset }: { active: Step; onChange: (step: Step) => void; bottomInset: number }) {
  const language = useAppStore((state) => state.settings.language);
  const steps = useMemo(() => getSteps(language), [language]);
  return (
    <ScrollView horizontal style={[styles.sidebar, styles.sidebarCompact]} contentContainerStyle={[styles.navContent, styles.navContentCompact, { paddingBottom: bottomInset + 6 }]}>
      {steps.map((item, index) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: active === item.id }}
          onPress={() => onChange(item.id)}
          style={[styles.navItem, styles.navItemCompact, active === item.id && styles.navItemActive]}
        >
          <View style={[styles.navIndexBubble, active === item.id && styles.navIndexBubbleActive]}>
            <Text style={[styles.navIndex, active === item.id && styles.navIndexActive]}>{item.marker}</Text>
          </View>
          <Text style={[styles.navLabel, styles.navLabelCompact, active === item.id && styles.navLabelActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function useActiveCv() {
  return useAppStore(selectActiveCv);
}

function BrandLockup({ variant }: { variant: "header" | "hero" | "panel" | "loading" }) {
  return (
    <View
      style={[
        styles.brandLockup,
        variant === "header" && styles.brandLockupHeader,
        variant === "hero" && styles.brandLockupHero,
        variant === "panel" && styles.brandLockupPanel,
        variant === "loading" && styles.brandLockupLoading
      ]}
    >
      <Image
        source={hirviaIcon}
        style={[
          styles.brandLockupIcon as ImageStyle,
          variant === "header" && (styles.headerIcon as ImageStyle),
          variant === "hero" && (styles.heroIcon as ImageStyle),
          variant === "panel" && (styles.brandIcon as ImageStyle),
          variant === "loading" && (styles.loadingIcon as ImageStyle)
        ]}
        resizeMode="contain"
      />
      <Text
        numberOfLines={1}
        style={[
          styles.brandWordmark,
          variant === "header" && styles.headerWordmark,
          variant === "hero" && styles.heroWordmark,
          variant === "panel" && styles.panelWordmark,
          variant === "loading" && styles.loadingWordmark
        ]}
      >
        Hirvia
      </Text>
    </View>
  );
}

function buildLegalUrl(section: "privacy" | "terms" | "help" | "subscription") {
  const envBase = String(process.env.EXPO_PUBLIC_LEGAL_BASE_URL ?? "").trim();
  const base =
    envBase ||
    (typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}/support/index.html`
      : "");
  return base ? `${base}#${section}` : `support/index.html#${section}`;
}

async function openLegalUrl(section: "privacy" | "terms" | "help" | "subscription") {
  const target = buildLegalUrl(section);
  if (typeof window !== "undefined") {
    window.open(target, "_blank", "noopener,noreferrer");
    return;
  }
  if (target.startsWith("http")) {
    await Linking.openURL(target);
  }
}

function useResolvedApiBaseUrl() {
  const settingsApiBaseUrl = useAppStore((state) => state.settings.apiBaseUrl);
  return useMemo(() => resolveApiBaseUrl(settingsApiBaseUrl), [settingsApiBaseUrl]);
}

function ProfileScreen({ next }: { next: () => void }) {
  const profile = useAppStore((state) => state.profile);
  const settings = useAppStore((state) => state.settings);
  const language = settings.language;
  const apiBaseUrl = useResolvedApiBaseUrl();
  const updateProfile = useAppStore((state) => state.updateProfile);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const addHistory = useAppStore((state) => state.addHistory);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const generate = async () => {
    if (settings.aiDataConsent !== true) {
      setMessage(t(language, "ai_consent_required"));
      return;
    }
    if (!spendCredit("profileSummary", t(language, "profile_summary_history"))) {
      setMessage(t(language, "credits_required"));
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "profileSummary",
      apiBaseUrl,
      provider: settings.aiProvider,
      input: { profile, tone: settings.tone }
    });
    const output = result.output;
    updateProfile({ summary: output });
    addHistory({ type: "summary", title: t(language, "profile_summary_history"), detail: output, ...aiHistoryMeta("profileSummary", result, profile.fullName || profile.title) });
    setMessage(result.status === "fallback" ? `${result.message} ${t(language, "credit_used_suffix")}` : t(language, "summary_generated"));
    setLoading(false);
  };

  return (
    <Section>
      <Title title={t(language, "profile_title")} subtitle={t(language, "profile_subtitle")} />
      <Field label={t(language, "profile_name")} value={profile.fullName} onChangeText={(fullName) => updateProfile({ fullName })} placeholder={t(language, "profile_name_placeholder")} />
      <Field label={t(language, "profile_target")} value={profile.title} onChangeText={(title) => updateProfile({ title })} placeholder={t(language, "profile_target_placeholder")} />
      <View style={styles.twoCols}>
        <Field label={t(language, "profile_email")} value={profile.email} onChangeText={(email) => updateProfile({ email })} placeholder={t(language, "profile_email_placeholder")} />
        <Field label={t(language, "profile_phone")} value={profile.phone} onChangeText={(phone) => updateProfile({ phone })} placeholder="+90..." />
      </View>
      <Field label={t(language, "profile_links")} value={`${profile.location}${profile.links ? `\n${profile.links}` : ""}`} onChangeText={(value) => {
        const [location = "", ...links] = splitLines(value);
        updateProfile({ location, links: links.join("\n") });
      }} multiline placeholder={t(language, "profile_links_placeholder")} />
      <Field label={t(language, "profile_summary")} value={profile.summary} onChangeText={(summary) => updateProfile({ summary })} multiline placeholder={t(language, "summary_placeholder")} />
      <ActionRow>
        <Button label={t(language, "generate")} onPress={generate} loading={loading} />
        <Button label={t(language, "next")} onPress={next} variant="secondary" />
      </ActionRow>
      {!!message && <Text style={styles.status}>{message}</Text>}
      <AiCostHint />
    </Section>
  );
}

function CvScreen({ next }: { next: () => void }) {
  const cv = useActiveCv();
  const cvs = useAppStore((state) => state.cvs);
  const settings = useAppStore((state) => state.settings);
  const language = settings.language;
  const apiBaseUrl = useResolvedApiBaseUrl();
  const setActiveCvId = useAppStore((state) => state.setActiveCvId);
  const updateCv = useAppStore((state) => state.updateCv);
  const createCv = useAppStore((state) => state.createCv);
  const duplicateCv = useAppStore((state) => state.duplicateCv);
  const deleteCv = useAppStore((state) => state.deleteCv);
  const addCvFromText = useAppStore((state) => state.addCvFromText);
  const addHistory = useAppStore((state) => state.addHistory);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const [selectedExperience, setSelectedExperience] = useState(0);
  const [selectedEducation, setSelectedEducation] = useState(0);
  const [draft, setDraft] = useState(normalizeCvTextForEditing(cv.rawText));
  const [draftName, setDraftName] = useState(cv.name);
  const [draftSummary, setDraftSummary] = useState(cv.summary);
  const [draftSkills, setDraftSkills] = useState(cv.skills.join(", "));
  const [draftRole, setDraftRole] = useState(cv.experience[0]?.role ?? "");
  const [draftCompany, setDraftCompany] = useState(cv.experience[0]?.company ?? "");
  const [draftPeriod, setDraftPeriod] = useState(cv.experience[0]?.period ?? "");
  const [draftBullets, setDraftBullets] = useState(cv.experience[0]?.bullets.join("\n") ?? "");
  const [draftEducation, setDraftEducation] = useState(
    formatEducationDraft(cv.education[0])
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const experience = cv.experience[selectedExperience] ?? cv.experience[0];
    const education = cv.education[selectedEducation] ?? cv.education[0];
    setDraft(normalizeCvTextForEditing(cv.rawText));
    setDraftName(localizeCvName(cv.name, language));
    setDraftSummary(cv.summary);
    setDraftSkills(cv.skills.join(", "));
    setDraftRole(experience?.role ?? "");
    setDraftCompany(experience?.company ?? "");
    setDraftPeriod(experience?.period ?? "");
    setDraftBullets(experience?.bullets.join("\n") ?? "");
    setDraftEducation(formatEducationDraft(education));
  }, [cv.id, language, selectedExperience, selectedEducation]);

  const buildStructuredCv = () => {
    const parsed = parseRawCvText({ ...cv, rawText: draft });
    const bullets = splitLines(draftBullets).map(cleanBulletInput).filter(Boolean);
    const educationParts = draftEducation.split(",").map((part) => part.trim());
    const nextCv = {
      ...parsed,
      name: draftName || parsed.name,
      summary: draftSummary || parsed.summary,
      skills: splitCsv(draftSkills).length ? splitCsv(draftSkills) : parsed.skills,
      experience: draftRole || draftCompany || draftPeriod || bullets.length
        ? upsertAt(cv.experience, selectedExperience, { id: cv.experience[selectedExperience]?.id ?? shortId("exp"), role: draftRole, company: draftCompany, period: draftPeriod, bullets })
        : parsed.experience,
      education: draftEducation
        ? upsertAt(cv.education, selectedEducation, { id: cv.education[selectedEducation]?.id ?? shortId("edu"), degree: educationParts[0] ?? "", school: educationParts[1] ?? "", period: educationParts.slice(2).join(", ") })
        : parsed.education
    };
    return {
      ...nextCv,
      rawText: serializeCvForEditing(nextCv)
    };
  };

  const addExperience = () => {
    const nextCv = buildStructuredCv();
    const experience = [...nextCv.experience, { id: shortId("exp"), role: "", company: "", period: "", bullets: [] }];
    updateCv({ ...nextCv, experience });
    setSelectedExperience(experience.length - 1);
  };

  const deleteExperience = () => {
    const experience = cv.experience.filter((_, index) => index !== selectedExperience);
    const nextCv = { ...cv, experience };
    updateCv({ ...nextCv, rawText: serializeCvForEditing(nextCv) });
    setSelectedExperience(Math.max(0, selectedExperience - 1));
  };

  const addEducation = () => {
    const nextCv = buildStructuredCv();
    const education = [...nextCv.education, { id: shortId("edu"), degree: "", school: "", period: "" }];
    updateCv({ ...nextCv, education });
    setSelectedEducation(education.length - 1);
  };

  const deleteEducation = () => {
    const education = cv.education.filter((_, index) => index !== selectedEducation);
    const nextCv = { ...cv, education };
    updateCv({ ...nextCv, rawText: serializeCvForEditing(nextCv) });
    setSelectedEducation(Math.max(0, selectedEducation - 1));
  };

  const importFile = async () => {
    try {
      const result = await pickCvDocument(apiBaseUrl);
      if (!result) return;
      const imported = parseRawCvText(addCvFromText(result.name, result.text));
      setSelectedExperience(0);
      setSelectedEducation(0);
      updateCv(imported);
      setDraftName(localizeCvName(imported.name, language));
      setDraft(imported.rawText);
      setDraftSummary(imported.summary);
      setDraftSkills(imported.skills.join(", "));
      setDraftRole(imported.experience[0]?.role ?? "");
      setDraftCompany(imported.experience[0]?.company ?? "");
      setDraftPeriod(imported.experience[0]?.period ?? "");
      setDraftBullets(imported.experience[0]?.bullets.join("\n") ?? "");
      setDraftEducation(formatEducationDraft(imported.education[0]));
      addHistory({ type: "import", title: t(language, "imported_cv_history"), detail: result.name });
      setMessage(tf(language, "cv_imported_confidence", { confidence: `${estimateCvParseConfidence(imported)}%` }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(language, "import_failed_paste"));
    }
  };

  const save = () => {
    updateCv(buildStructuredCv());
    setMessage(t(language, "cv_saved_locally"));
  };

  const organizeSkills = async () => {
    if (settings.aiDataConsent !== true) {
      setMessage(t(language, "ai_consent_required"));
      return;
    }
    if (!spendCredit("organizeSkills", t(language, "skills_organized_history"))) {
      setMessage(t(language, "credits_required"));
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "organizeSkills",
      apiBaseUrl,
      provider: settings.aiProvider,
      input: { rawText: draft, currentSkills: cv.skills, tone: settings.tone }
    });
    const output = result.output;
    const skills = splitCsv(output.replace(/Core:|Tools:|Strengths:/g, ""));
    setDraftSkills(skills.join(", "));
    updateCv({ ...buildStructuredCv(), skills });
    addHistory({ type: "rewrite", title: t(language, "skills_organized_history"), detail: output, ...aiHistoryMeta("organizeSkills", result, draft) });
    setMessage(result.status === "fallback" ? `${result.message} ${t(language, "credit_used_suffix")}` : t(language, "skills_organized_done"));
    setLoading(false);
  };

  return (
    <Section>
      <Title title={t(language, "cv_title")} subtitle={t(language, "cv_subtitle")} />
      <ChoiceRail options={cvs.map((item) => ({ label: localizeCvName(item.name, language), value: item.id }))} value={cv.id} onChange={setActiveCvId} />
      <ActionRow>
        <Button label={t(language, "new_cv")} onPress={() => createCv()} variant="secondary" />
        <Button label={t(language, "copy")} onPress={() => duplicateCv(cv.id)} variant="secondary" />
        <Button label={t(language, "delete")} onPress={() => deleteCv(cv.id)} variant="ghost" />
      </ActionRow>
      <Text style={styles.mutedLine}>{t(language, "last_updated")}: {formatDateTime(language, cv.updatedAt)}</Text>
      <Field label={t(language, "cv_name")} value={draftName} onChangeText={setDraftName} placeholder={t(language, "primary_cv")} />
      <Field label={t(language, "cv_text")} value={draft} onChangeText={setDraft} multiline placeholder={t(language, "imported_placeholder_cv")} />
      <View style={styles.divider} />
      <Text style={styles.subheadCompact}>{t(language, "core_title")}</Text>
      <Field label={t(language, "professional_summary")} value={draftSummary} onChangeText={setDraftSummary} multiline placeholder={t(language, "imported_placeholder_summary")} />
      <Field label={t(language, "skills_label")} value={draftSkills} onChangeText={setDraftSkills} placeholder={t(language, "imported_placeholder_skills")} />
      <View style={styles.builderGroup}>
        <ChoiceRail options={(cv.experience.length ? cv.experience : [{ id: "new", role: t(language, "experience_fallback") }]).map((item, index) => ({ label: item.role || `${t(language, "experience_section")} ${index + 1}`, value: String(index) }))} value={String(selectedExperience)} onChange={(value) => setSelectedExperience(Number(value))} />
        <Field label={t(language, "role")} value={draftRole} onChangeText={setDraftRole} placeholder={t(language, "imported_placeholder_role")} />
        <Field label={t(language, "company")} value={draftCompany} onChangeText={setDraftCompany} placeholder={t(language, "imported_placeholder_company")} />
        <Field label={t(language, "period")} value={draftPeriod} onChangeText={setDraftPeriod} placeholder={t(language, "imported_placeholder_period")} />
        <Field label={t(language, "bullets_label")} value={draftBullets} onChangeText={setDraftBullets} multiline placeholder={t(language, "bullet_examples_placeholder")} />
        <ActionRow>
        <Button label={t(language, "add_role")} onPress={addExperience} variant="secondary" />
        <Button label={t(language, "delete_role")} onPress={deleteExperience} variant="ghost" disabled={!cv.experience.length} />
        </ActionRow>
      </View>
      <ChoiceRail options={(cv.education.length ? cv.education : [{ id: "new", degree: t(language, "education_label") }]).map((item, index) => ({ label: item.degree || `${t(language, "education_label")} ${index + 1}`, value: String(index) }))} value={String(selectedEducation)} onChange={(value) => setSelectedEducation(Number(value))} />
      <Field label={t(language, "education_label")} value={draftEducation} onChangeText={setDraftEducation} placeholder={t(language, "imported_placeholder_education")} />
      <ActionRow>
        <Button label={t(language, "add_edu")} onPress={addEducation} variant="secondary" />
        <Button label={t(language, "delete_edu")} onPress={deleteEducation} variant="ghost" disabled={!cv.education.length} />
      </ActionRow>
      <ActionRow>
        <Button label={t(language, "import")} onPress={importFile} variant="secondary" />
        <Button label={t(language, "save")} onPress={save} />
        <Button label={t(language, "skills_label")} onPress={organizeSkills} loading={loading} variant="ghost" />
        <Button label={t(language, "rewrite")} onPress={next} variant="secondary" />
      </ActionRow>
      {!!message && <Text style={styles.status}>{message}</Text>}
      <AiCostHint />
    </Section>
  );
}

function BulletScreen({ next }: { next: () => void }) {
  const cv = useActiveCv();
  const settings = useAppStore((state) => state.settings);
  const language = settings.language;
  const apiBaseUrl = useResolvedApiBaseUrl();
  const updateCv = useAppStore((state) => state.updateCv);
  const addHistory = useAppStore((state) => state.addHistory);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const firstExperience = cv.experience[0];
  const initialBullets = firstExperience?.bullets.length ? firstExperience.bullets.join("\n") : "";
  const [source, setSource] = useState(initialBullets);
  const [rewritten, setRewritten] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!rewritten) setSource(initialBullets);
  }, [cv.id, initialBullets, rewritten]);

  const rewrite = async () => {
    if (!source.trim()) return;
    if (settings.aiDataConsent !== true) {
      setMessage(t(language, "ai_consent_required"));
      return;
    }
    if (!spendCredit("rewriteBullets", t(language, "bullets_rewritten_history"))) {
      setMessage(t(language, "credits_required"));
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "rewriteBullets",
      apiBaseUrl,
      provider: settings.aiProvider,
      input: { bullets: source, jobDescription: settings.lastJobDescription, tone: settings.tone }
    });
    const output = normalizeBulletOutput(result.output);
    setRewritten(output);
    addHistory({ type: "rewrite", title: t(language, "bullets_rewritten_history"), detail: output, ...aiHistoryMeta("rewriteBullets", result, source) });
    setMessage(result.status === "fallback" ? `${result.message} ${t(language, "credit_used_suffix")}` : t(language, "bullets_rewritten_done"));
    setLoading(false);
  };

  const apply = () => {
    const bullets = splitLines(normalizeBulletOutput(rewritten || source))
      .map(cleanBulletInput)
      .filter(Boolean);
    if (!bullets.length) {
      setMessage(language === "tr" ? "Uygulanacak deneyim maddesi bulunamadı." : "No experience bullets found to apply.");
      return;
    }
    const experience = cv.experience.length
      ? cv.experience.map((item, index) => (index === 0 ? { ...item, bullets } : item))
      : [{ id: shortId("exp"), company: "", role: "", period: "", bullets }];
    const nextCv = { ...cv, experience };
    updateCv({ ...nextCv, rawText: serializeCvForEditing(nextCv) });
    setSource(bullets.join("\n"));
    setRewritten("");
    setMessage(language === "tr" ? "Deneyim maddeleri uygulandı. Özgeçmiş sayfası ve dışa aktarım bu güncel maddeleri kullanır." : "Experience bullets applied. The CV page and export now use these updated bullets.");
  };

  return (
    <Section>
      <Title title={t(language, "bullets_title")} subtitle={t(language, "bullets_subtitle")} />
      <Field label={t(language, "current_bullets")} value={source} onChangeText={setSource} multiline placeholder={t(language, "source_bullets_placeholder")} />
      {loading ? <Skeleton lines={4} /> : rewritten ? <Text style={styles.resultText}>{rewritten}</Text> : <EmptyState text={t(language, "bullets_subtitle")} />}
      <ActionRow>
        <Button label={t(language, "rewrite")} onPress={rewrite} loading={loading} />
        <Button label={t(language, "apply")} onPress={apply} variant="secondary" disabled={!source.trim() && !rewritten.trim()} />
        <Button label={t(language, "job")} onPress={next} variant="ghost" />
      </ActionRow>
      {!!message && <Text style={styles.status}>{message}</Text>}
      <AiCostHint />
    </Section>
  );
}

function JobScreen({ next }: { next: () => void }) {
  const settings = useAppStore((state) => state.settings);
  const language = settings.language;
  const apiBaseUrl = useResolvedApiBaseUrl();
  const updateSettings = useAppStore((state) => state.updateSettings);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const addHistory = useAppStore((state) => state.addHistory);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const analyze = async () => {
    if (!settings.lastJobDescription.trim()) {
      setMessage(language === "tr" ? "Analiz için önce iş ilanını yapıştırın." : "Paste a job description before analysis.");
      return;
    }
    if (settings.aiDataConsent !== true) {
      setMessage(t(language, "ai_consent_required"));
      return;
    }
    if (!spendCredit("analyzeJob", t(language, "job_analyzed_history"))) {
      setMessage(t(language, "credits_required"));
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "analyzeJob",
      apiBaseUrl,
      provider: settings.aiProvider,
      input: { jobDescription: settings.lastJobDescription, jobSignals: extractJobSignals(settings.lastJobDescription), tone: settings.tone }
    });
    const output = result.output;
    setAnalysis(parseLooseJson<JobAnalysis>(output, { title: t(language, "target_role"), company: "", mustHave: splitLines(output).slice(0, 4), niceToHave: [], keywords: [], risks: [] }));
    addHistory({ type: "job", title: t(language, "job_analyzed_history"), detail: output, ...aiHistoryMeta("analyzeJob", result, settings.lastJobDescription) });
    setMessage(result.status === "fallback" ? `${result.message} ${t(language, "credit_used_suffix")}` : t(language, "job_analyzed_done"));
    setLoading(false);
  };

  return (
    <Section>
      <Title title={t(language, "job_title")} subtitle={t(language, "job_subtitle")} />
      <Field label={t(language, "job_title")} value={settings.lastJobDescription} onChangeText={(lastJobDescription) => updateSettings({ lastJobDescription })} multiline placeholder={t(language, "job_subtitle")} />
      {loading ? <Skeleton /> : analysis ? <InsightList title={t(language, "role_signals")} items={[...analysis.mustHave, ...analysis.keywords].slice(0, 8)} /> : <EmptyState text={t(language, "run_analysis_empty")} />}
      <ActionRow>
        <Button label={t(language, "analyze")} onPress={analyze} loading={loading} />
        <Button label={t(language, "next")} onPress={next} variant="secondary" />
      </ActionRow>
      {!!message && <Text style={styles.status}>{message}</Text>}
      <AiCostHint />
    </Section>
  );
}

function OptimizeScreen({ next }: { next: () => void }) {
  const cv = useActiveCv();
  const settings = useAppStore((state) => state.settings);
  const language = settings.language;
  const apiBaseUrl = useResolvedApiBaseUrl();
  const updateCv = useAppStore((state) => state.updateCv);
  const addHistory = useAppStore((state) => state.addHistory);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const [output, setOutput] = useState("");
  const [draft, setDraft] = useState<OptimizedCvDraft | null>(null);
  const [applyScope, setApplyScope] = useState<ApplyScope>("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const optimize = async () => {
    if (!settings.lastJobDescription.trim()) {
      setMessage(language === "tr" ? "Önce İş İlanı sayfasına hedef ilanı ekleyin. Optimizasyon ilana göre çalışır." : "Add the target job description first. Optimization depends on the job.");
      return;
    }
    if (settings.aiDataConsent !== true) {
      setMessage(t(language, "ai_consent_required"));
      return;
    }
    if (!spendCredit("optimizeCv", t(language, "cv_optimized_history"))) {
      setMessage(t(language, "credits_required"));
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "optimizeCv",
      apiBaseUrl,
      provider: settings.aiProvider,
      input: { cv, jobDescription: settings.lastJobDescription, jobSignals: extractJobSignals(settings.lastJobDescription), tone: settings.tone }
    });
    const response = result.output;
    const parsed = parseLooseJson<OptimizedCvDraft>(response, {
      summary: response,
      skills: cv.skills,
      experience: cv.experience,
      notes: [language === "tr" ? "AI yapılandırılmış veri yerine metin döndürdü. Metin optimize özet olarak korundu." : "AI returned text instead of structured JSON. The text was kept as the optimized summary."]
    });
    setOutput(response);
    setDraft(parsed);
    addHistory({ type: "optimize", title: t(language, "cv_optimized_history"), detail: response, ...aiHistoryMeta("optimizeCv", result, cv.name) });
    setMessage(result.status === "fallback" ? `${result.message} ${t(language, "credit_used_suffix")}` : t(language, "cv_optimized_done"));
    setLoading(false);
  };

  const apply = () => {
    if (!draft) return;
    const nextCv = {
      ...cv,
      summary: applyScope === "all" || applyScope === "summary" ? draft.summary || cv.summary : cv.summary,
      skills: applyScope === "all" || applyScope === "skills" ? draft.skills?.length ? draft.skills : cv.skills : cv.skills,
      experience: applyScope === "all" || applyScope === "bullets" ? draft.experience?.length ? draft.experience.map((item, index) => ({ ...item, id: item.id || cv.experience[index]?.id || shortId("exp") })) : cv.experience : cv.experience,
    };
    updateCv({
      ...nextCv,
      rawText: serializeCvForEditing(nextCv)
    });
    setMessage(tf(language, "changes_applied", { scope: getApplyScopeLabel(applyScope, language) }));
  };

  return (
    <Section>
      <Title title={t(language, "optimization_title")} subtitle={t(language, "optimization_subtitle")} />
      <Text style={styles.mutedLine}>{t(language, "keep_claims_real")}</Text>
      {loading ? <Skeleton lines={6} /> : draft ? (
        <>
          <OptimizationStats cv={cv} draft={draft} jobDescription={settings.lastJobDescription} />
          <Segmented<ApplyScope> options={[{ label: t(language, "optimize_all"), value: "all" }, { label: t(language, "optimize_summary"), value: "summary" }, { label: t(language, "optimize_skills"), value: "skills" }, { label: t(language, "optimize_bullets"), value: "bullets" }]} value={applyScope} onChange={setApplyScope} />
          <OptimizedPreview draft={draft} scope={applyScope} />
        </>
      ) : <EmptyState text={t(language, "optimize_empty")} />}
      <ActionRow>
        <Button label={t(language, "generate")} onPress={optimize} loading={loading} />
        <Button label={t(language, "apply")} onPress={apply} variant="secondary" disabled={!draft} />
        <Button label={t(language, "next")} onPress={next} variant="ghost" />
      </ActionRow>
      {!!message && <Text style={styles.status}>{message}</Text>}
      <AiCostHint />
    </Section>
  );
}

function AtsScreen({ next }: { next: () => void }) {
  const cv = useActiveCv();
  const settings = useAppStore((state) => state.settings);
  const language = settings.language;
  const apiBaseUrl = useResolvedApiBaseUrl();
  const updateCv = useAppStore((state) => state.updateCv);
  const addHistory = useAppStore((state) => state.addHistory);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const [report, setReport] = useState<AtsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const run = async () => {
    if (!settings.lastJobDescription.trim()) {
      setMessage(language === "tr" ? "Önce İş İlanı sayfasına hedef ilanı ekleyin. ATS kontrolü özgeçmişi bu ilana göre karşılaştırır." : "Add the target job first. The ATS check compares the CV against that job.");
      return;
    }
    if (settings.aiDataConsent !== true) {
      setMessage(t(language, "ai_consent_required"));
      return;
    }
    if (!spendCredit("atsCheck", t(language, "ats_checked_history"))) {
      setMessage(t(language, "credits_required"));
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "atsCheck",
      apiBaseUrl,
      provider: settings.aiProvider,
      input: { cv, jobDescription: settings.lastJobDescription, jobSignals: extractJobSignals(settings.lastJobDescription), tone: settings.tone }
    });
    const output = result.output;
    const parsed = parseLooseJson<AtsReport>(output, {
      score: 68,
      strengths: [language === "tr" ? "Okunabilir içerik" : "Readable content"],
      fixes: [language === "tr" ? "Deneyim maddelerini daha kısa ve sonuç odaklı yazın." : "Keep experience bullets shorter and outcome-oriented."],
      missingKeywords: extractJsonStringArray(output, "missingKeywords")
    });
    const enrichedReport = enrichAtsReport(parsed, cv, settings.lastJobDescription);
    setReport(enrichedReport);
    addHistory({
      type: "ats",
      title: t(language, "ats_checked_history"),
      detail: JSON.stringify(enrichedReport),
      ...aiHistoryMeta("atsCheck", { ...result, output: JSON.stringify(enrichedReport) }, cv.name)
    });
    setMessage(result.status === "fallback" ? `${result.message} ${t(language, "credit_used_suffix")}` : t(language, "ats_check_complete"));
    setLoading(false);
  };

  const addMissingKeywords = () => {
    if (!report?.missingKeywords.length) return;
    const current = new Set(cv.skills.map((skill) => skill.toLocaleLowerCase(TURKISH_LOCALE)));
    const additions = report.missingKeywords.filter((keyword) => !current.has(keyword.toLocaleLowerCase(TURKISH_LOCALE)));
    const nextCv = { ...cv, skills: [...cv.skills, ...additions] };
    updateCv({ ...nextCv, rawText: serializeCvForEditing(nextCv) });
    setMessage(additions.length ? t(language, "missing_keywords_added") : t(language, "keywords_already_present"));
    addHistory({ type: "ats", title: t(language, "ats_keywords_applied_history"), detail: additions.join(", ") || t(language, "keywords_already_present") });
  };

  return (
    <Section>
      <Title title={t(language, "ats_title")} subtitle={t(language, "ats_subtitle")} />
      {loading ? <Skeleton lines={4} /> : report ? (
        <View>
          <Text style={styles.score}>{report.score}</Text>
          <InsightList title={language === "tr" ? "Güçlü alanlar" : "Strong areas"} items={report.strengths} />
          <InsightList title={t(language, "fit_next")} items={report.fixes} />
          <InsightList title={t(language, "missing_keywords")} items={report.missingKeywords} />
          <InsightList title={t(language, "formatting_issues")} items={report.formattingIssues ?? []} />
          <InsightList title={t(language, "risky_phrases")} items={report.riskyPhrases ?? []} />
          <InsightList title={t(language, "action_items")} items={report.actionItems ?? []} />
        </View>
      ) : <EmptyState text={t(language, "ats_empty")} />}
      <ActionRow>
        <Button label={t(language, "scan")} onPress={run} loading={loading} />
        <Button label={t(language, "add_terms")} onPress={addMissingKeywords} variant="secondary" disabled={!report?.missingKeywords.length} />
        <Button label={t(language, "next")} onPress={next} variant="secondary" />
      </ActionRow>
      {!!message && <Text style={styles.status}>{message}</Text>}
      <AiCostHint />
    </Section>
  );
}

function ExportScreen({ next }: { next: () => void }) {
  const cv = useActiveCv();
  const profile = useAppStore((state) => state.profile);
  const state = useAppStore();
  const language = useAppStore((item) => item.settings.language);
  const updateCv = useAppStore((item) => item.updateCv);
  const addHistory = useAppStore((item) => item.addHistory);
  const [message, setMessage] = useState("");
  const templateOptions = useMemo(
    () =>
      cv.mode === "ats"
        ? [
            { value: "ats-compact" as TemplateId, label: t(language, "template_ats_compact") },
            { value: "ats-balanced" as TemplateId, label: t(language, "template_ats_balanced") },
            { value: "ats-spacious" as TemplateId, label: t(language, "template_ats_spacious") }
          ]
        : [{ value: "human-focus" as TemplateId, label: t(language, "template_human_focus") }],
    [cv.mode, language]
  );
  const orderOptions = useMemo(
    () => [
      { label: t(language, "standard"), value: "summary,skills,experience,education" },
      { label: t(language, "experience_first"), value: "summary,experience,skills,education" },
      { label: t(language, "skills_first"), value: "summary,skills,education,experience" }
    ],
    [language]
  );
  const spacingOptions = useMemo(
    () => [
      { label: t(language, "compact"), value: "compact" as SpacingId },
      { label: t(language, "balanced"), value: "balanced" as SpacingId },
      { label: t(language, "spacious"), value: "spacious" as SpacingId }
    ],
    [language]
  );
  const warnings = getExportWarnings(profile, cv);
  const exportAndLog = async (kind: "pdf" | "text") => {
    const msg = kind === "pdf" ? await exportPdf(profile, cv) : await exportText(profile, cv);
    setMessage(msg);
    addHistory({ type: "export", title: `${kind.toLocaleUpperCase("en-US")} export`, detail: msg });
  };

  return (
    <Section>
      <Title title={t(language, "export_title")} subtitle={t(language, "export_subtitle")} />
      <Segmented<CvMode> options={[{ label: t(language, "ats_mode"), value: "ats" }, { label: t(language, "human_mode"), value: "human" }]} value={cv.mode} onChange={(mode) => updateCv({ ...cv, mode, templateId: mode === "ats" ? "ats-balanced" : "human-focus" })} />
      <Text style={styles.mutedLine}>{t(language, "ats_help")}</Text>
      <View style={{ height: 12 }} />
      <Text style={styles.subheadCompact}>{t(language, "template_title")}</Text>
      <ChoiceRail<TemplateId> options={templateOptions} value={cv.templateId} onChange={(templateId) => updateCv({ ...cv, templateId })} />
      <Text style={styles.subheadCompact}>{t(language, "spacing_title")}</Text>
      <ChoiceRail<SpacingId> options={spacingOptions} value={cv.spacingId} onChange={(spacingId) => updateCv({ ...cv, spacingId })} />
      <Text style={styles.subheadCompact}>{t(language, "order_title")}</Text>
      <ChoiceRail options={orderOptions} value={cv.sectionOrder.join(",")} onChange={(value) => updateCv({ ...cv, sectionOrder: value.split(",") as CvSectionId[] })} />
      <ExportWarnings warnings={warnings} />
      <CvPreview profile={profile} cv={cv} />
      <ActionRow>
        <Button label={t(language, "pdf")} onPress={() => exportAndLog("pdf")} />
        <Button label={t(language, "text")} onPress={() => exportAndLog("text")} variant="secondary" />
        <Button label={t(language, "copy")} onPress={async () => setMessage(await copyTextExport(profile, cv))} variant="ghost" />
      </ActionRow>
      <ActionRow>
        <Button label={t(language, "prep")} onPress={next} variant="secondary" />
      </ActionRow>
    </Section>
  );
}

function getExportWarnings(profile: Profile, cv: Cv) {
  const language = useAppStore.getState().settings.language;
  return [
    !profile.fullName ? (language === "tr" ? "Ad eksik." : "Name is missing.") : "",
    !profile.email && !profile.phone ? (language === "tr" ? "En az bir iletişim yöntemi ekleyin." : "Add at least one contact method.") : "",
    !cv.summary && !profile.summary ? (language === "tr" ? "Özet eksik." : "Summary is missing.") : "",
    !cv.skills.length ? (language === "tr" ? "Yetenekler eksik." : "Skills are missing.") : "",
    !cv.experience.length || cv.experience.every((item) => !item.bullets.length) ? (language === "tr" ? "Deneyim maddeleri eksik." : "Experience bullets are missing.") : ""
  ].filter(Boolean);
}

function ExportWarnings({ warnings }: { warnings: string[] }) {
  const language = useAppStore((state) => state.settings.language);
  if (!warnings.length) return <Text style={styles.readyLine}>{t(language, "ready_export")}</Text>;
  return (
    <View style={styles.warningBox}>
      <Text style={styles.warningTitle}>{t(language, "before_export")}</Text>
      {warnings.map((warning) => <Text key={warning} style={styles.warningText}>- {warning}</Text>)}
    </View>
  );
}

function CvPreview({ profile, cv }: { profile: Profile; cv: Cv }) {
  const template = templates[cv.templateId];
  const preset = getTemplatePreset(cv);
  const human = template.mode === "human";
  const language = useAppStore((state) => state.settings.language);
  const contact = [profile.email, profile.phone, profile.location, profile.links].filter(Boolean).join(" | ");
  const spacing = preset.spacing;
  const bodyLineHeight = preset.bodyLine;
  const bodyFontSize = preset.bodySize;

  return (
    <View style={[styles.cvPaper, styles.cvPaperCompact, human && styles.cvPaperHuman, human && { padding: spacing + 10 }]}>
      <View style={[styles.modeBadge, human && styles.modeBadgeHuman]}>
        <Text style={[styles.modeBadgeText, human && styles.modeBadgeTextHuman]}>
          {human ? (language === "tr" ? "İnsan Modu" : "Human Mode") : (language === "tr" ? "ATS Modu" : "ATS Mode")}
        </Text>
      </View>
      <View style={[styles.cvHeader, human && styles.cvHeaderHuman, { paddingBottom: preset.headerGap, marginBottom: preset.sectionGap, borderBottomWidth: preset.borderThickness, borderBottomColor: human ? colors.accent : "#CBD5E1" }]}>
        <Text style={[styles.cvName, human && { fontSize: 28 }]}>{profile.fullName || t(language, "your_name")}</Text>
        {!!profile.title && <Text style={[styles.cvTitle, human && { fontSize: 16, marginTop: 6 }]}>{profile.title}</Text>}
        {!!contact && <Text style={[styles.cvMeta, human && { fontSize: 12.5, lineHeight: 20, marginTop: 5 }]}>{contact}</Text>}
      </View>
      {cv.sectionOrder.map((section) => (
        <CvPreviewContent
          key={section}
          section={section}
          profile={profile}
          cv={cv}
          human={human}
          bodyFontSize={bodyFontSize}
          bodyLineHeight={bodyLineHeight}
        />
      ))}
    </View>
  );
}

function CvPreviewContent({
  section,
  profile,
  cv,
  human,
  bodyFontSize,
  bodyLineHeight
}: {
  section: CvSectionId;
  profile: Profile;
  cv: Cv;
  human: boolean;
  bodyFontSize: number;
  bodyLineHeight: number;
}) {
  const language = useAppStore((state) => state.settings.language);
  const spacing = getSpacingValue(cv.spacingId);
  const bodyStyle = [styles.cvBody, { fontSize: bodyFontSize, lineHeight: bodyLineHeight }];
  if (section === "summary") {
    return <CvPreviewSection title={t(language, "summary_section")} spacing={spacing} human={human}><Text style={bodyStyle}>{cv.summary || profile.summary || t(language, "add_summary_before_export")}</Text></CvPreviewSection>;
  }
  if (section === "skills") {
    return (
      <CvPreviewSection title={t(language, "skills_section")} spacing={spacing} human={human}>
        <View style={human ? [styles.skillWrap, { gap: Math.max(6, spacing - 2) }] : undefined}>
          {cv.skills.length ? cv.skills.map((skill) => (
            <Text key={skill} style={human ? [styles.skillPill, { paddingHorizontal: spacing, paddingVertical: Math.max(5, spacing - 1), fontSize: 13.5 }] : bodyStyle}>{human ? skill : `- ${skill}`}</Text>
          )) : <Text style={bodyStyle}>{t(language, "add_role_skills")}</Text>}
        </View>
      </CvPreviewSection>
    );
  }
  if (section === "experience") {
    return (
      <CvPreviewSection title={t(language, "experience_section")} spacing={spacing} human={human}>
        {cv.experience.length ? cv.experience.map((item) => (
          <View key={item.id} style={[styles.cvExperience, { marginBottom: spacing }]}>
            {[item.role, item.company].filter(Boolean).length ? (
              <Text style={[styles.cvRole, human && { fontSize: 15, marginBottom: 4 }]}>{[item.role, item.company].filter(Boolean).join(" | ")}</Text>
            ) : null}
            {!!item.period && <Text style={[styles.cvMeta, { marginBottom: Math.max(4, spacing - 2) }]}>{item.period}</Text>}
            {item.bullets.map((bullet) => <Text key={bullet} style={bodyStyle}>- {bullet}</Text>)}
          </View>
        )) : <Text style={bodyStyle}>{t(language, "add_recent_bullets")}</Text>}
      </CvPreviewSection>
    );
  }
  return (
    <CvPreviewSection title={t(language, "education_section")} spacing={spacing} human={human}>
      {cv.education.length ? cv.education.map((item) => (
        <Text key={item.id} style={bodyStyle}>{[item.degree, item.school, item.period].filter(Boolean).join(", ")}</Text>
      )) : <Text style={bodyStyle}>{t(language, "education_optional")}</Text>}
    </CvPreviewSection>
  );
}

function CvPreviewSection({ title, spacing, human, children }: { title: string; spacing: number; human: boolean; children: React.ReactNode }) {
  const language = useAppStore((state) => state.settings.language);
  const sectionTitle = title.toLocaleUpperCase(language === "tr" ? "tr-TR" : "en-US");
  return (
    <View style={[styles.cvSection, { paddingTop: Math.max(10, spacing + 2) }]}>
      <Text style={[styles.cvSectionTitle, human && { fontSize: 11.5, color: colors.accent }, { marginBottom: Math.max(6, spacing - 2) }]}>{sectionTitle}</Text>
      {children}
    </View>
  );
}

function getSpacingValue(spacingId: SpacingId) {
  if (spacingId === "compact") return 6;
  if (spacingId === "spacious") return 14;
  return 10;
}

function InterviewScreen() {
  const cv = useActiveCv();
  const settings = useAppStore((state) => state.settings);
  const language = settings.language;
  const apiBaseUrl = useResolvedApiBaseUrl();
  const spendCredit = useAppStore((state) => state.spendCredit);
  const addHistory = useAppStore((state) => state.addHistory);
  const [pack, setPack] = useState<InterviewPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedPair, setSelectedPair] = useState(0);
  const [answerDraft, setAnswerDraft] = useState("");

  const generate = async () => {
    if (!settings.lastJobDescription.trim()) {
      setMessage(language === "tr" ? "Önce İş İlanı sayfasına hedef ilanı ekleyin. Mülakat hazırlığı ilan ve özgeçmiş birlikteyken anlamlı çalışır." : "Add the target job first. Interview prep works best with both job and CV context.");
      return;
    }
    if (settings.aiDataConsent !== true) {
      setMessage(t(language, "ai_consent_required"));
      return;
    }
    if (!spendCredit("interviewQuestions", t(language, "interview_pack_history"))) {
      setMessage(t(language, "credits_required"));
      return;
    }
    setLoading(true);
    const questionResult = await generateAIResult({
      task: "interviewQuestions",
      apiBaseUrl,
      provider: settings.aiProvider,
      input: { cv, jobDescription: settings.lastJobDescription, jobSignals: extractJobSignals(settings.lastJobDescription), tone: settings.tone }
    });
    const questions = questionResult.output;
    const parsedQuestions = parseLooseJson<{ categories: InterviewCategory[] }>(questions, {
      categories: categorizeQuestions(splitLines(questions))
    });
    const flatQuestions = parsedQuestions.categories.flatMap((category) => category.items);
    const answerResult = await generateAIResult({
      task: "interviewAnswers",
      apiBaseUrl,
      provider: settings.aiProvider,
      input: { questions: flatQuestions, cv, jobDescription: settings.lastJobDescription, jobSignals: extractJobSignals(settings.lastJobDescription), tone: settings.tone }
    });
    const answers = answerResult.output;
    const answerLines = splitLines(answers);
    const qaPairs = flatQuestions.map((question, index) => ({
      category: parsedQuestions.categories.find((category) => category.items.includes(question))?.title ?? "Behavioral",
      question,
      answer: answerLines[index] ?? answerLines[0] ?? ""
    }));
    setPack({ categories: parsedQuestions.categories, answers: answerLines, qaPairs });
    setSelectedPair(getFirstInterviewQuestionIndex(qaPairs));
    setAnswerDraft("");
    addHistory({ type: "interview", title: t(language, "interview_pack_history"), detail: `${questions}\n\n${answers}`, ...aiHistoryMeta("interviewQuestions", questionResult, cv.name) });
    setMessage(questionResult.status === "fallback" || answerResult.status === "fallback" ? t(language, "interview_prep_fallback") : t(language, "interview_prep_generated"));
    setLoading(false);
  };

  const improveAnswer = async () => {
    if (!pack?.qaPairs?.length) return;
    if (settings.aiDataConsent !== true) {
      setMessage(t(language, "ai_consent_required"));
      return;
    }
    if (!spendCredit("interviewAnswers", t(language, "interview_answer_improved_history"))) {
      setMessage(t(language, "credits_required"));
      return;
    }
    setLoading(true);
    const pair = pack.qaPairs[selectedPair];
    const result = await generateAIResult({
      task: "interviewAnswers",
      apiBaseUrl,
      provider: settings.aiProvider,
      input: {
        questions: [pair.question],
        currentAnswer: answerDraft || pair.answer,
        cv,
        jobDescription: settings.lastJobDescription,
        jobSignals: extractJobSignals(settings.lastJobDescription),
        tone: settings.tone
      }
    });
    const improved = splitLines(result.output)[0] ?? result.output;
    const qaPairs = pack.qaPairs.map((item, index) => (index === selectedPair ? { ...item, answer: improved } : item));
    setPack({ ...pack, qaPairs, answers: qaPairs.map((item) => item.answer) });
    setAnswerDraft(improved);
    setMessage(result.status === "fallback" ? `${result.message} ${t(language, "credit_used_suffix")}` : t(language, "answer_improved"));
    addHistory({ type: "interview", title: t(language, "interview_answer_improved_history"), detail: improved, ...aiHistoryMeta("interviewAnswers", result, pair.question) });
    setLoading(false);
  };

  const orderedPairs = pack ? getOrderedInterviewPairs(pack) : [];
  const selectedOrderedPair = orderedPairs.find((item) => item.originalIndex === selectedPair) ?? orderedPairs[0];

  return (
    <Section>
      <Title title={t(language, "interview_title")} subtitle={t(language, "interview_subtitle")} />
      {loading ? <Skeleton lines={6} /> : pack ? (
        <>
          <InsightList title={language === "tr" ? "Bu ilanda sorulabilecek sorular" : "Questions likely for this job"} items={getInterviewQuestionItemsByGroup(orderedPairs, "job")} />
          <InsightList title={language === "tr" ? "CV’ne göre gelebilecek sorular" : "Questions based on your CV"} items={getInterviewQuestionItemsByGroup(orderedPairs, "cv")} />
          {pack.qaPairs?.length ? (
            <>
              <Text style={styles.subheadCompact}>{language === "tr" ? "Örnek cevap oluştur" : "Create a sample answer"}</Text>
              <QuestionGrid
                items={orderedPairs}
                selectedIndex={selectedOrderedPair?.originalIndex ?? selectedPair}
                onSelect={setSelectedPair}
              />
              <InterviewAnswerCard pair={pack.qaPairs[selectedPair]} displayIndex={selectedOrderedPair?.displayIndex} />
              <Text style={styles.subheadCompact}>{language === "tr" ? "Cevabımı değerlendir" : "Review my answer"}</Text>
              <Text style={styles.mutedLine}>{language === "tr" ? "Cevabını yapıştır, daha net ve role uygun hale getirelim." : "Paste your answer and make it clearer and more relevant to the role."}</Text>
              <Field label={language === "tr" ? "Cevabım" : "My answer"} value={answerDraft} onChangeText={setAnswerDraft} multiline placeholder={language === "tr" ? "Kendi cevabını buraya yapıştır." : "Paste your answer here."} />
              <ActionRow>
                <Button label={language === "tr" ? "Cevabımı Değerlendir" : "Review Answer"} onPress={improveAnswer} variant="secondary" />
                <Button label={t(language, "copy")} onPress={() => copyText(pack.qaPairs?.[selectedPair]?.answer || "").then(setMessage)} variant="ghost" />
              </ActionRow>
            </>
          ) : <InsightList title={t(language, "answer_starters")} items={pack.answers} />}
        </>
      ) : <EmptyState text={t(language, "interview_empty")} />}
      <ActionRow>
        <Button label={t(language, "generate")} onPress={generate} loading={loading} />
      </ActionRow>
      {!!message && <Text style={styles.status}>{message}</Text>}
      <AiCostHint />
    </Section>
  );
}

type OrderedInterviewPair = {
  originalIndex: number;
  displayIndex: number;
  category: InterviewCategory["title"];
  question: string;
  answer: string;
};

function QuestionGrid({
  items,
  selectedIndex,
  onSelect
}: {
  items: OrderedInterviewPair[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View style={styles.questionGrid}>
      {items.map((item) => {
        const selected = item.originalIndex === selectedIndex;
        return (
          <Pressable
            key={`${item.originalIndex}_${item.question}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.originalIndex)}
            style={[styles.questionGridButton, selected && styles.questionGridButtonActive]}
          >
            <Text style={[styles.questionGridText, selected && styles.questionGridTextActive]}>{item.displayIndex}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function InterviewAnswerCard({ pair, displayIndex }: { pair?: { category: InterviewCategory["title"]; question: string; answer: string }; displayIndex?: number }) {
  const language = useAppStore((state) => state.settings.language);
  if (!pair) return null;
  return (
    <View style={[styles.answerCard, styles.answerCardCompact]}>
      <Text style={styles.previewLabel}>{localizeInterviewCategory(pair.category, language)}</Text>
      <Text style={styles.historyTitle}>{displayIndex ? `${displayIndex}. ${pair.question}` : pair.question}</Text>
      <Text style={styles.previewText}>{pair.answer}</Text>
    </View>
  );
}

function categorizeQuestions(questions: string[]): InterviewCategory[] {
  return [
    { title: "Behavioral", items: questions.slice(0, 3) },
    { title: "Technical", items: questions.slice(3, 5) },
    { title: "Role Fit", items: questions.slice(5, 6) }
  ].filter((category) => category.items.length > 0) as InterviewCategory[];
}

function localizeInterviewCategory(category: InterviewCategory["title"], language: AppLanguage) {
  if (category === "Behavioral") return t(language, "behavioral");
  if (category === "Technical") return t(language, "technical_cat");
  return t(language, "role_fit");
}

function getFirstInterviewQuestionIndex(pairs: { category: InterviewCategory["title"] }[]) {
  const firstJobQuestion = pairs.findIndex((pair) => pair.category === "Technical" || pair.category === "Role Fit");
  return firstJobQuestion >= 0 ? firstJobQuestion : 0;
}

function getOrderedInterviewPairs(pack: InterviewPack): OrderedInterviewPair[] {
  const pairs = pack.qaPairs?.length
    ? pack.qaPairs
    : (pack.categories ?? []).flatMap((category) => category.items.map((question) => ({ category: category.title, question, answer: "" })));
  const withOriginalIndex = pairs.map((pair, originalIndex) => ({ ...pair, originalIndex }));
  const ordered = [
    ...withOriginalIndex.filter((pair) => pair.category === "Technical" || pair.category === "Role Fit"),
    ...withOriginalIndex.filter((pair) => pair.category === "Behavioral")
  ];
  return ordered.map((pair, index) => ({ ...pair, displayIndex: index + 1 }));
}

function getInterviewQuestionItemsByGroup(pairs: OrderedInterviewPair[], group: "job" | "cv") {
  const wanted = group === "job" ? ["Technical", "Role Fit"] : ["Behavioral"];
  const items = pairs
    .filter((pair) => wanted.includes(pair.category))
    .map((pair) => `${pair.displayIndex}. ${pair.question}`)
    .slice(0, 3);
  if (items.length === 3) return items;
  return pairs.map((pair) => `${pair.displayIndex}. ${pair.question}`).slice(0, 3);
}

function AiCostHint() {
  const credits = useAppStore((state) => state.settings.credits);
  const language = useAppStore((state) => state.settings.language);
  return (
    <View style={[styles.costHint, credits <= 0 && styles.costHintEmpty]}>
      <Text style={[styles.costHintText, credits <= 0 && styles.costHintTextEmpty]}>
        {credits > 0 ? t(language, "cost_hint") : t(language, "cost_hint_empty")}
      </Text>
    </View>
  );
}

const knownJobTerms = [
  "React Native", "React", "TypeScript", "JavaScript", "Node.js", "Express", "Fastify", "Expo", "Next.js", "Vue", "Angular",
  "Python", "Java", "C#", ".NET", "PHP", "Laravel", "Go", "Golang", "Swift", "Kotlin",
  "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "GraphQL", "REST API", "API", "Docker", "Kubernetes",
  "AWS", "Azure", "Google Cloud", "GCP", "CI/CD", "DevOps", "Microservices", "Mikroservis", "Cloud", "Bulut",
  "HTML", "CSS", "Tailwind", "Figma", "UI", "UX", "SEO", "Google Ads", "Meta Business Suite", "WordPress",
  "Agile", "Scrum", "Kanban", "Jira", "ürün yönetimi", "proje yönetimi", "paydaş yönetimi", "performans analizi",
  "veri analizi", "raporlama", "içerik stratejisi", "topluluk yönetimi", "teknik yazarlık", "yapay zeka", "AI"
];

function extractJobSignals(jobDescription: string) {
  const text = collapseText(jobDescription);
  const lowerText = text.toLocaleLowerCase(TURKISH_LOCALE);
  const keywords = uniqueStrings([
    ...knownJobTerms.filter((term) => lowerText.includes(term.toLocaleLowerCase(TURKISH_LOCALE))),
    ...extractExplicitJobPhrases(jobDescription)
  ]).slice(0, 18);
  const mustHave = extractRequirementLines(jobDescription).slice(0, 6);
  const role = extractTargetRole(jobDescription);
  return { role, keywords, mustHave };
}

function extractExplicitJobPhrases(jobDescription: string) {
  const phrases = new Set<string>();
  const techPattern = /\b([A-Z][A-Za-z0-9+#.]{1,}(?:\s+[A-Z][A-Za-z0-9+#.]{1,}){0,2})\b/g;
  for (const match of jobDescription.matchAll(techPattern)) {
    const phrase = match[1].trim();
    if (phrase.length >= 3 && !/^(We|The|And|This|Our|You|Job|About|Responsibilities|Requirements)$/i.test(phrase)) {
      phrases.add(phrase);
    }
  }
  return [...phrases].slice(0, 8);
}

function extractRequirementLines(jobDescription: string) {
  return splitLines(jobDescription)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 18 && line.length <= 180)
    .filter((line) => /deneyim|bilgi|hakim|aran|beklen|required|requirement|experience|knowledge|familiar|proficient|responsib/i.test(line))
    .slice(0, 8);
}

function extractTargetRole(jobDescription: string) {
  const firstMeaningful = splitLines(jobDescription).find((line) => line.trim().length > 4 && line.trim().length < 90) ?? "";
  const roleMatch = firstMeaningful.match(/([A-Za-zÇĞİÖŞÜçğıöşü .+-]*(developer|engineer|manager|specialist|uzman|geliştirici|mühendis|yönetici|analist)[A-Za-zÇĞİÖŞÜçğıöşü .+-]*)/i);
  return collapseText(roleMatch?.[1] || firstMeaningful).slice(0, 90);
}

function getJobKeywords(jobDescription: string) {
  return extractJobSignals(jobDescription).keywords;
}

function getCvSearchText(cv: Cv, profile?: Profile) {
  return [
    profile?.fullName,
    profile?.title,
    profile?.summary,
    cv.name,
    cv.summary,
    cv.rawText,
    cv.skills.join(" "),
    cv.experience.map((item) => [item.role, item.company, item.period, item.bullets.join(" ")].join(" ")).join(" "),
    cv.education.map((item) => [item.degree, item.school, item.period].join(" ")).join(" ")
  ].filter(Boolean).join(" ").toLocaleLowerCase(TURKISH_LOCALE);
}

function getKeywordMatch(jobDescription: string, cv: Cv, profile?: Profile) {
  const keywords = getJobKeywords(jobDescription);
  const haystack = getCvSearchText(cv, profile);
  const aligned = keywords.filter((keyword) => haystack.includes(keyword.toLocaleLowerCase(TURKISH_LOCALE)));
  const missing = keywords.filter((keyword) => !aligned.includes(keyword));
  return { keywords, aligned, missing, coverage: keywords.length ? Math.round((aligned.length / keywords.length) * 100) : 0 };
}

function aiHistoryMeta(task: AiTask, result: AiResult, input: string) {
  return {
    task,
    provider: result.provider,
    promptVersion: result.promptVersion,
    inputSummary: input.slice(0, 180),
    outputSummary: result.output.slice(0, 180),
    status: result.status
  };
}

function formatHistoryDetail(item: HistoryItem, language: AppLanguage) {
  const rawDetail = collapseText(item.detail || item.outputSummary || "");
  if (!looksLikeJson(rawDetail)) return rawDetail;

  const parsed = parseLooseJson<unknown>(rawDetail, null);
  if (!parsed || typeof parsed !== "object") {
    return language === "tr" ? "Yapılandırılmış çıktı kaydedildi." : "Structured output saved.";
  }

  if (item.type === "ats" || hasKeys(parsed, ["score", "missingKeywords", "fixes"])) {
    return summarizeAtsHistory(parsed, language);
  }

  if (item.type === "optimize" || hasKeys(parsed, ["summary", "skills", "experience", "notes"])) {
    return summarizeOptimizedHistory(parsed, language);
  }

  if (item.type === "interview" || hasKeys(parsed, ["categories", "answers", "qaPairs"])) {
    return summarizeInterviewHistory(parsed, language);
  }

  if (item.type === "job" || hasKeys(parsed, ["title", "mustHave", "keywords", "risks"])) {
    return summarizeJobHistory(parsed, language);
  }

  return language === "tr" ? "Yapılandırılmış çıktı kaydedildi." : "Structured output saved.";
}

function collapseText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, maxLength = 220) {
  const clean = collapseText(value);
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trim()}…` : clean;
}

function looksLikeJson(value: string) {
  const first = value.trim()[0];
  return first === "{" || first === "[";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasKeys(value: unknown, keys: string[]) {
  const record = asRecord(value);
  return keys.some((key) => key in record);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => collapseText(String(item))).filter(Boolean) : [];
}

function summarizeAtsHistory(value: unknown, language: AppLanguage) {
  const report = asRecord(value);
  const score = typeof report.score === "number" ? report.score : Number(report.score);
  const missing = stringArray(report.missingKeywords).slice(0, 4);
  const fixes = stringArray(report.fixes).slice(0, 1);
  const strengths = stringArray(report.strengths).slice(0, 1);
  const parts = [
    Number.isFinite(score) ? (language === "tr" ? `Skor ${score}` : `Score ${score}`) : "",
    missing.length ? (language === "tr" ? `Eksik terimler: ${missing.join(", ")}` : `Missing keywords: ${missing.join(", ")}`) : "",
    fixes.length ? (language === "tr" ? `İlk düzeltme: ${fixes[0]}` : `First fix: ${fixes[0]}`) : "",
    !fixes.length && strengths.length ? (language === "tr" ? `Güçlü yön: ${strengths[0]}` : `Strength: ${strengths[0]}`) : ""
  ].filter(Boolean);
  return clipText(parts.join(". "));
}

function summarizeOptimizedHistory(value: unknown, language: AppLanguage) {
  const draft = asRecord(value);
  const summary = typeof draft.summary === "string" ? draft.summary : "";
  const skills = stringArray(draft.skills).slice(0, 4);
  const experience = Array.isArray(draft.experience) ? draft.experience.map(asRecord) : [];
  const firstBullets = experience.flatMap((item) => stringArray(item.bullets)).slice(0, 1);
  const parts = [
    summary ? (language === "tr" ? `Özet: ${summary}` : `Summary: ${summary}`) : "",
    skills.length ? (language === "tr" ? `Yetenekler: ${skills.join(", ")}` : `Skills: ${skills.join(", ")}`) : "",
    firstBullets.length ? (language === "tr" ? `Deneyim: ${firstBullets[0]}` : `Experience: ${firstBullets[0]}`) : ""
  ].filter(Boolean);
  return clipText(parts.join(". "));
}

function summarizeInterviewHistory(value: unknown, language: AppLanguage) {
  const pack = asRecord(value);
  const categories = Array.isArray(pack.categories) ? pack.categories.map(asRecord) : [];
  const questions = categories.flatMap((category) => stringArray(category.items));
  const qaPairs = Array.isArray(pack.qaPairs) ? pack.qaPairs.map(asRecord) : [];
  const pairQuestions = qaPairs.map((pair) => typeof pair.question === "string" ? pair.question : "").filter(Boolean);
  const allQuestions = [...questions, ...pairQuestions];
  const count = allQuestions.length;
  const first = allQuestions[0] || stringArray(pack.answers)[0] || "";
  const prefix = language === "tr" ? `Mülakat seti: ${count || 1} soru` : `Interview set: ${count || 1} question${count === 1 ? "" : "s"}`;
  return clipText(first ? `${prefix}. ${language === "tr" ? "İlk soru" : "First question"}: ${first}` : prefix);
}

function summarizeJobHistory(value: unknown, language: AppLanguage) {
  const analysis = asRecord(value);
  const title = typeof analysis.title === "string" ? analysis.title : "";
  const company = typeof analysis.company === "string" ? analysis.company : "";
  const keywords = stringArray(analysis.keywords).slice(0, 5);
  const mustHave = stringArray(analysis.mustHave).slice(0, 2);
  const role = [title, company].filter(Boolean).join(" - ");
  const parts = [
    role ? (language === "tr" ? `Rol: ${role}` : `Role: ${role}`) : "",
    keywords.length ? (language === "tr" ? `Anahtar kelimeler: ${keywords.join(", ")}` : `Keywords: ${keywords.join(", ")}`) : "",
    mustHave.length ? (language === "tr" ? `Öne çıkanlar: ${mustHave.join(", ")}` : `Must-have: ${mustHave.join(", ")}`) : ""
  ].filter(Boolean);
  return clipText(parts.join(". "));
}

function buildStarDraft(situation: string, task: string, action: string, result: string) {
  const language = useAppStore.getState().settings.language;
  return [
    situation ? `${language === "tr" ? "Durum" : "Situation"}: ${situation}` : "",
    task ? `${language === "tr" ? "Görev" : "Task"}: ${task}` : "",
    action ? `${language === "tr" ? "Aksiyon" : "Action"}: ${action}` : "",
    result ? `${language === "tr" ? "Sonuç" : "Result"}: ${result}` : ""
  ].filter(Boolean).join("\n");
}

async function copyText(value: string) {
  const language = useAppStore.getState().settings.language;
  await Clipboard.setStringAsync(value);
  return t(language, "copied");
}

function HistoryScreen() {
  const history = useAppStore((state) => state.history);
  const language = useAppStore((state) => state.settings.language);
  const [filter, setFilter] = useState<"all" | "optimize" | "ats" | "interview" | "export">("all");
  const [showAll, setShowAll] = useState(false);
  const filteredHistory = filter === "all" ? history : history.filter((item) => item.type === filter);
  const visibleHistory = showAll ? filteredHistory : filteredHistory.slice(0, 8);
  const hiddenCount = Math.max(0, filteredHistory.length - visibleHistory.length);

  useEffect(() => {
    setShowAll(false);
  }, [filter]);

  return (
    <Section>
      <Title title={t(language, "history_title")} subtitle={t(language, "history_subtitle")} />
      <ChoiceRail
        value={filter}
        onChange={setFilter}
        options={[
          { label: t(language, "history_export"), value: "export" },
          { label: t(language, "draft"), value: "optimize" },
          { label: "ATS", value: "ats" },
          { label: t(language, "history_prep"), value: "interview" },
          { label: t(language, "all"), value: "all" }
        ]}
      />
      {visibleHistory.length ? visibleHistory.map((item) => (
        <View key={item.id} style={styles.historyRowCompact}>
          <Text style={styles.historyTitle}>{item.title}</Text>
          <Text style={styles.historyMeta}>{formatDateTime(language, item.createdAt)}</Text>
          <Text numberOfLines={2} style={styles.historyDetail}>{formatHistoryDetail(item, language)}</Text>
        </View>
      )) : <EmptyState text={t(language, "no_matching_history")} />}
      {filteredHistory.length > 8 ? (
        <ActionRow>
          <Button
            label={showAll
              ? (language === "tr" ? "Daha Az Göster" : "Show Less")
              : (language === "tr" ? `Tüm Geçmişi Göster (${hiddenCount} kayıt daha)` : `Show All History (${hiddenCount} more)`)}
            onPress={() => setShowAll((value) => !value)}
            variant="secondary"
          />
        </ActionRow>
      ) : null}
    </Section>
  );
}

function SettingsScreen() {
  const settings = useAppStore((state) => state.settings);
  const creditTransactions = useAppStore((state) => state.creditTransactions);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const restoreCredits = useAppStore((state) => state.restoreCredits);
  const canAfford = useAppStore((state) => state.canAfford);
  const importLocalData = useAppStore((state) => state.importLocalData);
  const resetLocalData = useAppStore((state) => state.resetLocalData);
  const [backupMode, setBackupMode] = useState<"merge" | "replace">("merge");
  const [message, setMessage] = useState("");
  const [confirmBackupImport, setConfirmBackupImport] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const visibleCreditTransactions = showAllActivity ? creditTransactions : creditTransactions.slice(0, 8);
  const hiddenActivityCount = Math.max(0, creditTransactions.length - visibleCreditTransactions.length);

  const buy = async (productId: ProductId) => {
    const result = await purchaseCredits(productId);
    if (result.ok) restoreCredits(settings.credits + result.credits, "purchase", tf(settings.language, "purchase_note", { credits: result.credits }));
    setMessage(result.message);
  };

  const restore = async () => {
    const result = await restorePurchases();
    if (result.ok) restoreCredits(result.credits, "restore", tf(settings.language, "restore_note", { credits: result.credits }));
    setMessage(result.message);
  };

  const importBackup = async () => {
    try {
      const data = await pickJsonBackup();
      if (!data) return;
      importLocalData(data, backupMode);
      const cvCount = data.cvs?.length ?? 0;
      const historyCount = data.history?.length ?? 0;
      setMessage(tf(settings.language, "backup_complete", { mode: backupMode, cvCount, historyCount }));
      setConfirmBackupImport(false);
    } catch {
      setMessage(t(settings.language, "backup_import_failed"));
      setConfirmBackupImport(false);
    }
  };

  const language = settings.language;

  return (
    <Section>
      <Title title={t(language, "settings_title")} subtitle={t(language, "settings_subtitle")} />
      <Text style={styles.subheadCompact}>{t(language, "tone_title")}</Text>
      <Segmented options={[{ label: t(language, "direct"), value: "direct" }, { label: t(language, "executive"), value: "executive" }, { label: t(language, "technical"), value: "technical" }]} value={settings.tone} onChange={(tone) => updateSettings({ tone })} />
      <Text style={styles.mutedLine}>{t(language, "tone_help")}</Text>
      <View style={styles.tonePreviewBox}>
        <Text style={styles.previewLabel}>{language === "tr" ? "Canlı ton önizlemesi" : "Live tone preview"}</Text>
        {getTonePreview(settings.tone, language).map((line) => (
          <Text key={line} style={styles.tonePreviewText}>- {line}</Text>
        ))}
      </View>
      <Text style={styles.subheadCompact}>{t(language, "ai_consent_title")}</Text>
      <Segmented options={[{ label: t(language, "ai_consent_allow"), value: "on" }, { label: t(language, "ai_consent_deny"), value: "off" }]} value={settings.aiDataConsent === true ? "on" : "off"} onChange={(value) => updateSettings({ aiDataConsent: value === "on" })} />
      <Text style={styles.mutedLine}>{settings.aiDataConsent ? t(language, "ai_consent_on") : t(language, "ai_consent_off")}</Text>
      <Text style={styles.mutedLine}>{t(language, "ai_consent_detail")}</Text>
      <Text style={styles.subheadCompact}>{t(language, "subscription_info_title")}</Text>
      <Text style={styles.mutedLine}>{t(language, "subscription_info_body")}</Text>
      <Text style={styles.mutedLine}>{t(language, "subscription_info_note")}</Text>
      <ActionRow>
        <Button label={t(language, "open_privacy")} onPress={() => void openLegalUrl("privacy")} variant="secondary" />
        <Button label={t(language, "open_terms")} onPress={() => void openLegalUrl("terms")} variant="secondary" />
        <Button label={t(language, "open_help")} onPress={() => void openLegalUrl("help")} variant="secondary" />
      </ActionRow>
      <Text style={styles.subheadCompact}>{t(language, "credits_title")}</Text>
      <Text style={styles.mutedLine}>{tf(language, "balance_line", { credits: settings.credits })}</Text>
      <View style={styles.productGrid}>
        {(Object.entries(creditProducts) as [ProductId, (typeof creditProducts)[ProductId]][]).map(([productId, product]) => (
          <Pressable key={productId} onPress={() => buy(productId)} style={styles.productOption}>
            <Text style={styles.productTitle}>{localizeCreditProduct(productId, language).label || product.label}</Text>
            <Text style={styles.productDescription}>{localizeCreditProduct(productId, language).description || product.description}</Text>
          </Pressable>
        ))}
      </View>
      {!canAfford("profileSummary") ? <Text style={styles.warningText}>{t(language, "no_credit_warning")}</Text> : null}
      {!!message && <Text style={styles.status}>{message}</Text>}
      <ActionRow>
        <Button label={t(language, "restore")} onPress={restore} variant="secondary" />
        <Button label={t(language, "reset")} onPress={resetLocalData} variant="ghost" />
      </ActionRow>
      <Text style={styles.subheadCompact}>{t(language, "backup_title")}</Text>
      <Segmented options={[{ label: t(language, "merge"), value: "merge" }, { label: t(language, "replace"), value: "replace" }]} value={backupMode} onChange={setBackupMode} />
      <Text style={styles.mutedLine}>{backupMode === "merge" ? t(language, "backup_help_merge") : t(language, "backup_help_replace")}</Text>
      {confirmBackupImport ? (
        <>
          <Text style={styles.warningText}>{getBackupConfirmText(language, backupMode)}</Text>
          <ActionRow>
            <Button label={language === "tr" ? "İçe Aktarmayı Onayla" : "Confirm Import"} onPress={importBackup} variant="secondary" />
            <Button label={language === "tr" ? "Vazgeç" : "Cancel"} onPress={() => setConfirmBackupImport(false)} variant="ghost" />
          </ActionRow>
        </>
      ) : (
        <ActionRow>
          <Button label={t(language, "import")} onPress={() => setConfirmBackupImport(true)} variant="secondary" />
        </ActionRow>
      )}
      <Text style={styles.subheadCompact}>{t(language, "activity_title")}</Text>
      {visibleCreditTransactions.length ? visibleCreditTransactions.map((item) => (
        <View key={item.id} style={styles.historyRowCompact}>
          <Text style={styles.historyTitle}>{item.note}</Text>
          <Text style={styles.historyMeta}>{formatDateTime(language, item.createdAt)}</Text>
          <Text style={styles.historyDetail}>{tf(language, "credit_amount", { value: item.amount > 0 ? `+${item.amount}` : item.amount })}</Text>
        </View>
      )) : <EmptyState text={t(language, "no_credit_activity")} />}
      {creditTransactions.length > 8 ? (
        <ActionRow>
          <Button
            label={showAllActivity
              ? (language === "tr" ? "Daha Az Göster" : "Show Less")
              : (language === "tr" ? `Tüm Hareketleri Göster (${hiddenActivityCount} kayıt daha)` : `Show All Activity (${hiddenActivityCount} more)`)}
            onPress={() => setShowAllActivity((value) => !value)}
            variant="secondary"
          />
        </ActionRow>
      ) : null}
    </Section>
  );
}

function localizeCreditProduct(productId: ProductId, language: AppLanguage) {
  if (language !== "tr") return creditProducts[productId];
  const trCopy: Record<ProductId, { label: string; description: string; credits: number }> = {
    credits_25: { label: "25 kredi", credits: 25, description: "Hızlı optimizasyon paketi" },
    credits_100: { label: "100 kredi", credits: 100, description: "Başvuru maratonu paketi" }
  };
  return trCopy[productId];
}

function getTonePreview(tone: "direct" | "executive" | "technical", language: AppLanguage) {
  if (language === "tr") {
    if (tone === "executive") return [
      "Daha stratejik ve kıdemli bir dil öne çıkar.",
      "Sahiplik, paydaş uyumu ve iş etkisi daha görünür olur.",
      "Özetler daha karar verici odaklı okunur."
    ];
    if (tone === "technical") return [
      "Araçlar, yöntemler ve uygulama detayları daha net yazılır.",
      "Süreç ve teknik katkı daha görünür hale gelir.",
      "Çıktı daha sistematik ve uygulamaya yakın hissedilir."
    ];
    return [
      "Kısa, net ve doğrudan bir anlatım öne çıkar.",
      "Gereksiz süslemeler azalır.",
      "Mesaj daha hızlı ve anlaşılır okunur."
    ];
  }
  if (tone === "executive") return [
    "The writing becomes more strategic and senior in tone.",
    "Ownership, stakeholder alignment, and business impact stand out.",
    "Summaries read more decision-maker friendly."
  ];
  if (tone === "technical") return [
    "Tools, methods, and implementation detail become more explicit.",
    "Process and technical contribution become easier to see.",
    "The output feels more systematic and execution focused."
  ];
  return [
    "The writing stays short, direct, and plainspoken.",
    "Extra framing is reduced.",
    "The message becomes faster to scan."
  ];
}

function getBackupConfirmText(language: AppLanguage, backupMode: "merge" | "replace") {
  if (language === "tr") {
    return backupMode === "merge"
      ? "Birleştir seçili. Yedekteki kayıtlar mevcut yerel verilere eklenecek."
      : "Değiştir seçili. Bu cihazdaki yerel veriler yedekteki içerikle yenilenecek.";
  }
  return backupMode === "merge"
    ? "Merge is selected. Backup records will be added into the current local data."
    : "Replace is selected. Local data on this device will be overwritten by the backup.";
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.insights}>
      <Text style={styles.insightTitle}>{title}</Text>
      {items.map((item) => (
        <Text key={`${title}_${item}`} style={styles.insightItem}>- {item}</Text>
      ))}
    </View>
  );
}

function OptimizedPreview({ draft, scope }: { draft: OptimizedCvDraft; scope: ApplyScope }) {
  const language = useAppStore((state) => state.settings.language);
  const firstExperience = draft.experience?.[0];
  const showSummary = scope === "all" || scope === "summary";
  const showSkills = scope === "all" || scope === "skills";
  const showExperience = scope === "all" || scope === "bullets";
  const showNotes = scope === "all";
  return (
    <View style={styles.previewBlock}>
      {showSummary && !!draft.summary && (
        <>
          <Text style={styles.previewLabel}>{t(language, "summary_section")}</Text>
          <Text style={styles.previewText}>{draft.summary}</Text>
        </>
      )}
      {showSkills ? <InsightList title={t(language, "skills_section")} items={draft.skills ?? []} /> : null}
      {showExperience && firstExperience ? (
        <View style={styles.insights}>
          {[firstExperience.role, firstExperience.company].filter(Boolean).length ? (
            <Text style={styles.insightTitle}>{[firstExperience.role, firstExperience.company].filter(Boolean).join(" | ")}</Text>
          ) : null}
          {firstExperience.bullets.map((bullet) => (
            <Text key={bullet} style={styles.insightItem}>- {bullet}</Text>
          ))}
        </View>
      ) : null}
      {showNotes ? <InsightList title={t(language, "notes")} items={draft.notes ?? []} /> : null}
    </View>
  );
}

function getApplyScopeLabel(scope: ApplyScope, language: AppLanguage) {
  const tr: Record<ApplyScope, string> = {
    all: "Tümü",
    summary: "Özet",
    skills: "Yetenekler",
    bullets: "Deneyimler"
  };
  const en: Record<ApplyScope, string> = {
    all: "All",
    summary: "Summary",
    skills: "Skills",
    bullets: "Experience"
  };
  return language === "tr" ? tr[scope] : en[scope];
}

function cleanBulletInput(line: string) {
  return line.replace(/^[-*\d.)\s]+/, "").replace(/^\u2022\s*/, "").trim();
}

function normalizeBulletOutput(value: string) {
  const parsed = parseLooseJson<{ bullets?: unknown }>(value, {});
  if (Array.isArray(parsed.bullets)) {
    return parsed.bullets.map((item) => cleanBulletInput(String(item))).filter(Boolean).join("\n");
  }
  if (typeof parsed.bullets === "string") {
    return splitLines(parsed.bullets).map(cleanBulletInput).filter(Boolean).join("\n");
  }
  return splitLines(value)
    .map(cleanBulletInput)
    .filter((line) => line && !/^(bullets|jobDescription|tone|language)\s*:/i.test(line) && !["{", "}", "[", "]"].includes(line))
    .join("\n");
}

function normalizeCvTextForEditing(value: string) {
  const parsed = parseLooseJson<Partial<OptimizedCvDraft>>(value, {});
  const hasStructuredCv =
    typeof parsed.summary === "string" ||
    Array.isArray(parsed.skills) ||
    Array.isArray(parsed.experience) ||
    Array.isArray(parsed.notes);
  if (!hasStructuredCv) return value;

  const sections = [
    parsed.summary ? `Özet\n${parsed.summary}` : "",
    Array.isArray(parsed.skills) && parsed.skills.length ? `Yetenekler\n${parsed.skills.join(", ")}` : "",
    Array.isArray(parsed.experience) && parsed.experience.length
      ? `Deneyim\n${parsed.experience.map((item) => {
          const role = [item.role, item.company, item.period].filter(Boolean).join(" | ");
          const bullets = Array.isArray(item.bullets) ? item.bullets.map((bullet) => `- ${bullet}`).join("\n") : "";
          return [role, bullets].filter(Boolean).join("\n");
        }).join("\n\n")}`
      : "",
    Array.isArray(parsed.notes) && parsed.notes.length ? `Notlar\n${parsed.notes.map((note) => `- ${note}`).join("\n")}` : ""
  ].filter(Boolean);

  return sections.join("\n\n");
}

function serializeCvForEditing(cv: Cv) {
  const sections = [
    cv.summary ? `Özet\n${cv.summary}` : "",
    cv.skills.length ? `Yetenekler\n${cv.skills.join(", ")}` : "",
    cv.experience.length
      ? `Deneyim\n${cv.experience.map((item) => {
          const role = [item.role, item.company, item.period].filter(Boolean).join(" | ");
          const bullets = item.bullets.map((bullet) => `- ${bullet}`).join("\n");
          return [role, bullets].filter(Boolean).join("\n");
        }).join("\n\n")}`
      : "",
    cv.education.length
      ? `Eğitim\n${cv.education.map((item) => [item.degree, item.school, item.period].filter(Boolean).join(", ")).join("\n")}`
      : ""
  ].filter(Boolean);
  return sections.join("\n\n");
}

function extractJsonStringArray(value: string, key: string) {
  const match = value.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, "i"));
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1].trim()).filter(Boolean);
}

function OptimizationStats({ cv, draft, jobDescription }: { cv: Cv; draft: OptimizedCvDraft; jobDescription: string }) {
  const language = useAppStore((state) => state.settings.language);
  const addedSkills = draft.skills.filter((skill) => !cv.skills.some((current) => current.toLocaleLowerCase(TURKISH_LOCALE) === skill.toLocaleLowerCase(TURKISH_LOCALE)));
  const coverage = getKeywordCoverage(jobDescription, draft);
  const bulletDelta = (draft.experience[0]?.bullets.length ?? 0) - (cv.experience[0]?.bullets.length ?? 0);

  return (
    <View style={styles.optimizationStats}>
      <Text style={styles.optimizationStatText}>{tf(language, "keyword_coverage", { value: coverage })}</Text>
      <Text style={styles.optimizationStatText}>{tf(language, "added_skills_count", { value: addedSkills.length })}</Text>
      <Text style={styles.optimizationStatText}>{tf(language, "bullet_delta", { value: bulletDelta >= 0 ? `+${bulletDelta}` : bulletDelta })}</Text>
      {!!addedSkills.length && <Text style={styles.optimizationStatSub}>{addedSkills.slice(0, 6).join(" | ")}</Text>}
    </View>
  );
}

function getKeywordCoverage(jobDescription: string, draft: OptimizedCvDraft) {
  const keywords = getJobKeywords(jobDescription).slice(0, 18);
  if (!keywords.length) return 0;
  const haystack = `${draft.summary} ${draft.skills.join(" ")} ${draft.experience.flatMap((item) => item.bullets).join(" ")}`.toLocaleLowerCase(TURKISH_LOCALE);
  const matched = keywords.filter((keyword) => haystack.includes(keyword.toLocaleLowerCase(TURKISH_LOCALE)));
  return Math.round((matched.length / keywords.length) * 100);
}

function enrichAtsReport(report: AtsReport, cv: Cv, jobDescription: string): AtsReport {
  const language = useAppStore.getState().settings.language;
  const keywordMatch = getKeywordMatch(jobDescription, cv);
  const jobLower = jobDescription.toLocaleLowerCase(TURKISH_LOCALE);
  const formattingIssues = [...(report.formattingIssues ?? [])];
  const riskyPhrases = [...(report.riskyPhrases ?? [])];
  const actionItems = [...(report.actionItems ?? [])];
  const strengths = [...(report.strengths ?? [])];
  const aiMissingFromJob = (report.missingKeywords ?? [])
    .filter((keyword) => jobLower.includes(keyword.toLocaleLowerCase(TURKISH_LOCALE)))
    .slice(0, 6);
  const missingKeywords = uniqueStrings([...aiMissingFromJob, ...keywordMatch.missing.slice(0, 8)]);
  const raw = cv.rawText.toLocaleLowerCase(TURKISH_LOCALE);

  if (cv.rawText.length > 4000) formattingIssues.push(t(language, "cv_too_long"));
  if (cv.experience.some((item) => item.bullets.length > 6)) formattingIssues.push(t(language, "too_many_bullets"));
  if (keywordMatch.aligned.length) {
    strengths.push(language === "tr"
      ? `İlanla örtüşen terimler: ${keywordMatch.aligned.slice(0, 5).join(", ")}`
      : `Terms aligned with the job: ${keywordMatch.aligned.slice(0, 5).join(", ")}`);
  }
  if (keywordMatch.missing.length) {
    actionItems.push(language === "tr"
      ? `Eksik terimleri doğal şekilde ekleyin: ${keywordMatch.missing.slice(0, 5).join(", ")}`
      : `Add missing terms naturally: ${keywordMatch.missing.slice(0, 5).join(", ")}`);
  }
  for (const phrase of ["hardworking", "team player", "responsible for", "helped with"]) {
    if (raw.includes(phrase)) riskyPhrases.push(tf(language, "replace_weak_phrase", { phrase }));
  }
  if (!actionItems.length) {
    actionItems.push(t(language, "keep_bullets_short"));
    if (report.missingKeywords?.length) actionItems.push(t(language, "add_missing_keywords_naturally"));
  }
  if (!keywordMatch.keywords.length) {
    actionItems.push(language === "tr"
      ? "İş ilanında net teknik/rol terimi az görünüyor. Daha tam ilan metniyle tekrar kontrol edin."
      : "The job text has few clear role terms. Re-run with the full job description.");
  }

  return {
    ...report,
    score: keywordMatch.keywords.length ? clamp(Math.round(report.score * 0.35 + keywordMatch.coverage * 0.65), 0, 100) : clamp(report.score, 0, 100),
    strengths: uniqueStrings(strengths),
    missingKeywords,
    formattingIssues: uniqueStrings(formattingIssues),
    riskyPhrases: uniqueStrings(riskyPhrases),
    actionItems: uniqueStrings(actionItems)
  };
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function formatDateTime(language: AppLanguage, value: string) {
  const locale = language === "tr" ? "tr-TR" : "en-US";
  return new Date(value).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function upsertAt<T>(items: T[], index: number, value: T) {
  const next = [...items];
  next[index] = value;
  return next;
}

function formatEducationDraft(education?: { degree?: string; school?: string; period?: string } | null) {
  if (!education) return "";
  return [education.degree, education.school, education.period].map((item) => String(item ?? "").trim()).filter(Boolean).join(", ");
}

function localizeCvName(name: string, language: AppLanguage) {
  if (language !== "tr") return name;
  if (name === "Primary CV" || name === "Ana CV") return "Ana Özgeçmiş";
  if (name === "New CV" || name === "Yeni CV") return "Yeni Özgeçmiş";
  return name.replace(/ Copy$/, " Kopya");
}

function ChoiceRail<T extends string>({
  options,
  value,
  onChange
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choiceRail}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: value === option.value }}
          onPress={() => onChange(option.value)}
          style={[styles.choice, value === option.value && styles.choiceActive]}
        >
          <Text style={[styles.choiceText, value === option.value && styles.choiceTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <View style={[styles.actions, styles.actionsCompact]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg
  },
  shell: {
    flex: 1
  },
  shellCompact: {
    flexDirection: "column"
  },
  sidebar: {
    backgroundColor: colors.ink,
    flexGrow: 0
  },
  sidebarCompact: {
    maxHeight: 76,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10
  },
  navContent: {
    padding: 14,
    gap: 8
  },
  navContentCompact: {
    paddingVertical: 6,
    paddingHorizontal: 8
  },
  navItem: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  navItemCompact: {
    minWidth: 58,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: "column",
    gap: 2
  },
  navItemActive: {
    backgroundColor: "#1E293B"
  },
  navIndex: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800"
  },
  navIndexBubble: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  navIndexBubbleActive: {
    backgroundColor: "#312E81"
  },
  navIndexActive: {
    color: "#A5B4FC"
  },
  navLabel: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "700"
  },
  navLabelCompact: {
    fontSize: 10,
    textAlign: "center"
  },
  navLabelActive: {
    color: colors.white
  },
  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    paddingBottom: 28,
    paddingHorizontal: 14
  },
  contentCompact: {
    paddingBottom: 18
  },
  contentCompactTight: {
    paddingBottom: 10
  },
  splashSection: {
    flex: 1,
    minHeight: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  splashMark: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 8
  },
  splashIcon: {
    width: 64,
    height: 64,
    borderRadius: 18
  },
  splashName: {
    color: colors.ink,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "900",
    includeFontPadding: false
  },
  splashSubtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  splashProgress: {
    width: 150,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
    marginTop: 8
  },
  splashProgressFill: {
    width: "72%",
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accent
  },
  onboardingScroll: {
    flexGrow: 1,
    justifyContent: "center"
  },
  onboardingSection: {
    flex: 1,
    justifyContent: "center",
    minHeight: "100%"
  },
  onboardingList: {
    gap: 10,
    marginTop: 6,
    marginBottom: 10
  },
  onboardingItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 14
  },
  onboardingIndex: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink
  },
  onboardingIndexText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900"
  },
  onboardingCopy: {
    flex: 1,
    gap: 4
  },
  onboardingItemTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  onboardingItemBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  consentSection: {
    flex: 1,
    justifyContent: "center",
    minHeight: "100%"
  },
  scrollArea: {
    flex: 1
  },
  header: {
    minHeight: 72,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row"
  },
  headerCompact: {
    minHeight: 62,
    paddingHorizontal: 14
  },
  headerTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerTextWrap: {
    gap: 2,
    flexShrink: 1
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  languageSwitch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  languageChip: {
    minWidth: 36,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  languageChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.soft
  },
  languageChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  languageChipTextActive: {
    color: colors.accentDark
  },
  brandLockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start"
  },
  brandLockupHeader: {
    minHeight: 30
  },
  brandLockupHero: {
    marginBottom: 10
  },
  brandLockupPanel: {
    gap: 12
  },
  brandLockupLoading: {
    justifyContent: "center",
    marginBottom: 8
  },
  brandLockupIcon: {
    flexShrink: 0
  },
  brandWordmark: {
    color: colors.ink,
    fontWeight: "800",
    includeFontPadding: false
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 8
  },
  headerWordmark: {
    fontSize: 26,
    lineHeight: 28,
    letterSpacing: 0.2
  },
  headerStep: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  loadingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12
  },
  loadingWordmark: {
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: 0.2
  },
  brandCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.white
  },
  infoPanel: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 14,
    gap: 8,
    marginTop: 6,
    marginBottom: 10
  },
  infoPanelSoft: {
    borderWidth: 1,
    borderColor: "#D8E0F0",
    backgroundColor: "#F8FAFF",
    borderRadius: 8,
    padding: 14,
    gap: 6,
    marginBottom: 8
  },
  infoText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 10
  },
  panelWordmark: {
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: 0.2
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 12
  },
  heroWordmark: {
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: 0.2
  },
  creditPill: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  creditPillEmpty: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2"
  },
  creditText: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 12
  },
  creditTextEmpty: {
    color: colors.danger
  },
  twoCols: {
    gap: 14,
    flexDirection: "column"
  },
  mutedLine: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginVertical: 8
  },
  status: {
    color: colors.success,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 6,
    textAlign: "center",
    alignSelf: "center",
    maxWidth: 420,
    lineHeight: 20
  },
  costHint: {
    alignSelf: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 12,
    marginBottom: 4
  },
  costHintEmpty: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2"
  },
  costHintText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  costHintTextEmpty: {
    color: colors.danger
  },
  warningBox: {
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    padding: 12,
    marginTop: 14
  },
  warningTitle: {
    color: "#92400E",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 5
  },
  warningText: {
    color: "#92400E",
    fontSize: 13,
    lineHeight: 20
  },
  readyLine: {
    alignSelf: "flex-start",
    color: colors.success,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 14
  },
  productGrid: {
    gap: 8,
    marginBottom: 12
  },
  productOption: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 72,
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1
  },
  productTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 3
  },
  productDescription: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 17
  },
  optimizationStats: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    gap: 4
  },
  optimizationStatText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800"
  },
  optimizationStatSub: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20
  },
  textPreviewBox: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 8,
    marginTop: 14,
    padding: 14,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2
  },
  textPreviewText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20
  },
  answerCard: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 14,
    marginTop: 10,
    marginBottom: 8
  },
  answerCardCompact: {
    padding: 12,
    marginTop: 8
  },
  questionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    marginTop: 4,
    marginBottom: 8
  },
  questionGridButton: {
    flexBasis: "31%",
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center"
  },
  questionGridButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.soft
  },
  questionGridText: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center"
  },
  questionGridTextActive: {
    color: colors.accentDark
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 22
  },
  subhead: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12
  },
  subheadCompact: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 10
  },
  tonePreviewBox: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    marginBottom: 8
  },
  tonePreviewText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  builderGroup: {
    borderLeftWidth: 1,
    borderLeftColor: "#C7D2FE",
    paddingLeft: 12,
    marginBottom: 10
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    gap: 10,
    marginTop: 14
  },
  actionsCompact: {
    flexDirection: "row",
    alignItems: "stretch"
  },
  centerAction: {
    width: "100%",
    maxWidth: 260,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4
  },
  choiceRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    gap: 8,
    paddingVertical: 6
  },
  choice: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    minWidth: 110,
    flexGrow: 1,
    flexBasis: 0
  },
  choiceActive: {
    borderColor: colors.accent,
    backgroundColor: colors.soft
  },
  choiceText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center"
  },
  choiceTextActive: {
    color: colors.accentDark
  },
  resultText: {
    color: colors.text,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 16,
    fontSize: 15,
    lineHeight: 23
  },
  previewBlock: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 14
  },
  previewLabel: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8
  },
  previewText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23
  },
  cvPaper: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    marginTop: 18,
    padding: 18,
    width: "100%",
    alignSelf: "stretch"
  },
  modeBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10
  },
  modeBadgeHuman: {
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF"
  },
  modeBadgeText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0
  },
  modeBadgeTextHuman: {
    color: colors.accent
  },
  cvPaperCompact: {
    marginTop: 14,
    padding: 12
  },
  cvPaperHuman: {
    borderColor: "#C7D2FE"
  },
  cvHeader: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    paddingBottom: 12,
    marginBottom: 8
  },
  cvHeaderHuman: {
    borderBottomColor: colors.accent,
    borderBottomWidth: 2
  },
  cvName: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: 0
  },
  cvTitle: {
    color: colors.text,
    fontSize: 15,
    marginTop: 4
  },
  cvMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3
  },
  cvSection: {
    paddingTop: 12
  },
  cvSectionTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 6
  },
  cvBody: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21
  },
  cvExperience: {
    marginBottom: 10
  },
  cvRole: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2
  },
  skillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  skillPill: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: colors.text,
    fontSize: 13
  },
  score: {
    color: colors.ink,
    fontSize: 64,
    fontWeight: "800",
    letterSpacing: 0
  },
  insights: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  insightTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 8
  },
  insightItem: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23
  },
  historyRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 14
  },
  historyRowCompact: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 10
  },
  historyTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 16
  },
  historyMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
    marginBottom: 4
  },
  runtimeErrorBox: {
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: 14,
    marginTop: 8
  },
  runtimeErrorTitle: {
    color: "#991B1B",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6
  },
  runtimeErrorText: {
    color: "#991B1B",
    fontSize: 14,
    lineHeight: 20
  },
  historyDetail: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21
  }
});
