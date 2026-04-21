import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, EmptyState, Field, Screen, Section, Segmented, Skeleton, Title, colors } from "./src/components/ui";
import * as Clipboard from "expo-clipboard";
import { pickJsonBackup } from "./src/services/backup";
import { estimateCvParseConfidence, parseRawCvText } from "./src/services/cvParser";
import { AiResult, generateAIResult } from "./src/services/ai";
import { copyTextExport, exportJson, exportPdf, exportText, previewTextExport } from "./src/services/exporter";
import { pickCvDocument } from "./src/services/importer";
import { creditProducts, ProductId, purchaseCredits, restorePurchases } from "./src/services/purchases";
import { templates } from "./src/services/templates";
import { selectActiveCv, useAppStore } from "./src/store/useAppStore";
import { AiTask, AtsReport, Cv, CvMode, CvSectionId, InterviewCategory, InterviewPack, JobAnalysis, OptimizedCvDraft, Profile, TemplateId } from "./src/types";
import { parseLooseJson } from "./src/utils/json";
import { splitCsv, splitLines, shortId } from "./src/utils/text";

type Step = "profile" | "cv" | "bullets" | "job" | "optimize" | "ats" | "export" | "interview" | "history" | "settings";

const hirviaLogo = require("./assets/branding/hirvia-logo.png");
const hirviaIcon = require("./assets/branding/hirvia-icon-final.png");

const steps: { id: Step; label: string; marker: string }[] = [
  { id: "profile", label: "Me", marker: "P" },
  { id: "cv", label: "CV", marker: "C" },
  { id: "bullets", label: "Edit", marker: "B" },
  { id: "job", label: "Job", marker: "J" },
  { id: "optimize", label: "Draft", marker: "O" },
  { id: "ats", label: "ATS", marker: "A" },
  { id: "export", label: "Export", marker: "E" },
  { id: "interview", label: "Prep", marker: "I" },
  { id: "history", label: "Log", marker: "L" },
  { id: "settings", label: "Prefs", marker: "S" }
];

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
    return (
      <SafeAreaView style={styles.safe}>
        <Screen>
          <Section>
            <Title title="App error" subtitle="A runtime issue blocked the screen. Local data is still on this device." />
            <View style={styles.brandCard}>
              <Image source={hirviaIcon} style={styles.brandIcon} resizeMode="contain" />
              <Image source={hirviaLogo} style={styles.brandLogo} resizeMode="contain" />
            </View>
            <View style={styles.runtimeErrorBox}>
              <Text style={styles.runtimeErrorTitle}>Runtime message</Text>
              <Text style={styles.runtimeErrorText}>{this.state.message}</Text>
            </View>
            <View style={[styles.actions, styles.actionsCompact]}>
              <Button label="Retry app" onPress={this.retry} />
            </View>
          </Section>
        </Screen>
      </SafeAreaView>
    );
  }
}

function AppShell() {
  const [step, setStep] = useState<Step>("profile");
  const hydrated = useAppStore((state) => state.hydrated);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [step]);

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen>
          <Section>
            <Image source={hirviaLogo} style={styles.loadingLogo} resizeMode="contain" />
            <Title title="Hirvia" subtitle="Loading your local workspace." />
            <Skeleton lines={5} />
          </Section>
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

function Header({ step }: { step: Step }) {
  const credits = useAppStore((state) => state.settings.credits);
  const currentStep = steps.find((item) => item.id === step);
  return (
    <View style={[styles.header, styles.headerCompact]}>
      <View style={styles.headerTextWrap}>
        <View style={styles.headerBrandRow}>
          <Image source={hirviaIcon} style={styles.headerIcon} resizeMode="contain" />
          <View style={styles.headerBrandTextWrap}>
            <Image source={hirviaLogo} style={styles.headerLogo} resizeMode="contain" />
            <Text style={styles.headerStep}>{currentStep?.label}</Text>
          </View>
        </View>
      </View>
      <View style={[styles.creditPill, credits <= 0 && styles.creditPillEmpty]}>
        <Text style={[styles.creditText, credits <= 0 && styles.creditTextEmpty]}>{credits} credits</Text>
      </View>
    </View>
  );
}

function Sidebar({ active, onChange, bottomInset }: { active: Step; onChange: (step: Step) => void; bottomInset: number }) {
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

function ProfileScreen({ next }: { next: () => void }) {
  const profile = useAppStore((state) => state.profile);
  const settings = useAppStore((state) => state.settings);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const addHistory = useAppStore((state) => state.addHistory);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const generate = async () => {
    if (!spendCredit("profileSummary", "Profile summary generation")) {
      setMessage("Credits required. Add credits in Settings to use AI.");
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "profileSummary",
      apiBaseUrl: settings.apiBaseUrl,
      provider: settings.aiProvider,
      input: { profile, tone: settings.tone }
    });
    const output = result.output;
    updateProfile({ summary: output });
    addHistory({ type: "summary", title: "Profile summary", detail: output, ...aiHistoryMeta("profileSummary", result, profile.fullName || profile.title) });
    setMessage(result.status === "fallback" ? `${result.message} 1 credit used.` : "Summary generated. 1 credit used.");
    setLoading(false);
  };

  return (
    <Section>
      <View style={styles.heroPanel}>
        <View style={styles.heroBrandRow}>
          <Image source={hirviaIcon} style={styles.heroIcon} resizeMode="contain" />
          <Image source={hirviaLogo} style={styles.heroLogo} resizeMode="contain" />
        </View>
        <Text style={styles.heroLine}>The smart path to getting hired.</Text>
      </View>
      <Title title="Profile" subtitle="Set the essentials once." />
      <Field label="Name" value={profile.fullName} onChangeText={(fullName) => updateProfile({ fullName })} placeholder="Ayse Yilmaz" />
      <Field label="Target title" value={profile.title} onChangeText={(title) => updateProfile({ title })} placeholder="Product Manager" />
      <View style={styles.twoCols}>
        <Field label="Email" value={profile.email} onChangeText={(email) => updateProfile({ email })} placeholder="you@email.com" />
        <Field label="Phone" value={profile.phone} onChangeText={(phone) => updateProfile({ phone })} placeholder="+90..." />
      </View>
      <Field label="Location and links" value={`${profile.location}${profile.links ? `\n${profile.links}` : ""}`} onChangeText={(value) => {
        const [location = "", ...links] = splitLines(value);
        updateProfile({ location, links: links.join("\n") });
      }} multiline placeholder={"Istanbul\nlinkedin.com/in/..."} />
      <Field label="Summary" value={profile.summary} onChangeText={(summary) => updateProfile({ summary })} multiline placeholder="Short and specific." />
      <AiCostHint />
      {!!message && <Text style={styles.status}>{message}</Text>}
      <ActionRow>
        <Button label="Generate summary" onPress={generate} loading={loading} />
        <Button label="Next" onPress={next} variant="secondary" />
      </ActionRow>
    </Section>
  );
}

function CvScreen({ next }: { next: () => void }) {
  const cv = useActiveCv();
  const cvs = useAppStore((state) => state.cvs);
  const settings = useAppStore((state) => state.settings);
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
  const [draft, setDraft] = useState(cv.rawText);
  const [draftName, setDraftName] = useState(cv.name);
  const [draftSummary, setDraftSummary] = useState(cv.summary);
  const [draftSkills, setDraftSkills] = useState(cv.skills.join(", "));
  const [draftRole, setDraftRole] = useState(cv.experience[0]?.role ?? "");
  const [draftCompany, setDraftCompany] = useState(cv.experience[0]?.company ?? "");
  const [draftPeriod, setDraftPeriod] = useState(cv.experience[0]?.period ?? "");
  const [draftBullets, setDraftBullets] = useState(cv.experience[0]?.bullets.join("\n") ?? "");
  const [draftEducation, setDraftEducation] = useState(
    cv.education[0] ? `${cv.education[0].degree}, ${cv.education[0].school} ${cv.education[0].period}`.trim() : ""
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const experience = cv.experience[selectedExperience] ?? cv.experience[0];
    const education = cv.education[selectedEducation] ?? cv.education[0];
    setDraft(cv.rawText);
    setDraftName(cv.name);
    setDraftSummary(cv.summary);
    setDraftSkills(cv.skills.join(", "));
    setDraftRole(experience?.role ?? "");
    setDraftCompany(experience?.company ?? "");
    setDraftPeriod(experience?.period ?? "");
    setDraftBullets(experience?.bullets.join("\n") ?? "");
    setDraftEducation(education ? `${education.degree}, ${education.school} ${education.period}`.trim() : "");
  }, [cv.id, selectedExperience, selectedEducation]);

  const buildStructuredCv = () => {
    const parsed = parseRawCvText({ ...cv, rawText: draft });
    const bullets = splitLines(draftBullets).map(cleanBulletInput).filter(Boolean);
    const educationParts = draftEducation.split(",").map((part) => part.trim());
    return {
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
  };

  const addExperience = () => {
    const nextCv = buildStructuredCv();
    const experience = [...nextCv.experience, { id: shortId("exp"), role: "", company: "", period: "", bullets: [] }];
    updateCv({ ...nextCv, experience });
    setSelectedExperience(experience.length - 1);
  };

  const deleteExperience = () => {
    const experience = cv.experience.filter((_, index) => index !== selectedExperience);
    updateCv({ ...cv, experience });
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
    updateCv({ ...cv, education });
    setSelectedEducation(Math.max(0, selectedEducation - 1));
  };

  const importFile = async () => {
    try {
      const result = await pickCvDocument(settings.apiBaseUrl);
      if (!result) return;
      const imported = parseRawCvText(addCvFromText(result.name, result.text));
      updateCv(imported);
      setDraft(imported.rawText);
      setDraftSummary(imported.summary);
      setDraftSkills(imported.skills.join(", "));
      setDraftRole(imported.experience[0]?.role ?? "");
      setDraftCompany(imported.experience[0]?.company ?? "");
      setDraftPeriod(imported.experience[0]?.period ?? "");
      setDraftBullets(imported.experience[0]?.bullets.join("\n") ?? "");
      addHistory({ type: "import", title: "Imported CV", detail: result.name });
      setMessage(`CV imported and parsed. Confidence: ${estimateCvParseConfidence(imported)}%. Review editable fields below.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed. Paste the CV text instead.");
    }
  };

  const save = () => {
    updateCv(buildStructuredCv());
    setMessage("CV saved locally.");
  };

  const organizeSkills = async () => {
    if (!spendCredit("organizeSkills", "Skills organization")) {
      setMessage("Credits required. Add credits in Settings to use AI.");
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "organizeSkills",
      apiBaseUrl: settings.apiBaseUrl,
      provider: settings.aiProvider,
      input: { rawText: draft, currentSkills: cv.skills }
    });
    const output = result.output;
    const skills = splitCsv(output.replace(/Core:|Tools:|Strengths:/g, ""));
    setDraftSkills(skills.join(", "));
    updateCv({ ...buildStructuredCv(), skills });
    addHistory({ type: "rewrite", title: "Skills organized", detail: output, ...aiHistoryMeta("organizeSkills", result, draft) });
    setMessage(result.status === "fallback" ? `${result.message} 1 credit used.` : "Skills organized. 1 credit used.");
    setLoading(false);
  };

  return (
    <Section>
      <Title title="CV" subtitle="Import or paste your CV, then tighten the core fields." />
      <ChoiceRail options={cvs.map((item) => ({ label: item.name, value: item.id }))} value={cv.id} onChange={setActiveCvId} />
      <ActionRow>
        <Button label="New" onPress={() => createCv()} variant="secondary" />
        <Button label="Copy" onPress={() => duplicateCv(cv.id)} variant="secondary" />
        <Button label="Delete" onPress={() => deleteCv(cv.id)} variant="ghost" />
      </ActionRow>
      <Text style={styles.mutedLine}>Last updated: {new Date(cv.updatedAt).toLocaleString()}</Text>
      <Field label="CV name" value={draftName} onChangeText={setDraftName} placeholder="Primary CV" />
      <Field label="CV text" value={draft} onChangeText={setDraft} multiline placeholder="Paste CV text here." />
      {cv.skills.length ? <Text style={styles.mutedLine}>{cv.skills.slice(0, 12).join(" | ")}</Text> : <EmptyState text="No skills organized yet." />}
      <View style={styles.divider} />
      <Text style={styles.subheadCompact}>Core</Text>
      <Field label="Professional summary" value={draftSummary} onChangeText={setDraftSummary} multiline placeholder="2-3 lines with clear role fit." />
      <Field label="Skills" value={draftSkills} onChangeText={setDraftSkills} placeholder="Strategy, SQL, stakeholder management" />
      <View style={styles.builderGroup}>
        <ChoiceRail options={(cv.experience.length ? cv.experience : [{ id: "new", role: "Experience" }]).map((item, index) => ({ label: item.role || `Experience ${index + 1}`, value: String(index) }))} value={String(selectedExperience)} onChange={(value) => setSelectedExperience(Number(value))} />
        <Field label="Role" value={draftRole} onChangeText={setDraftRole} placeholder="Product Manager" />
        <Field label="Company" value={draftCompany} onChangeText={setDraftCompany} placeholder="Company" />
        <Field label="Period" value={draftPeriod} onChangeText={setDraftPeriod} placeholder="2021 - Present" />
        <Field label="Bullets" value={draftBullets} onChangeText={setDraftBullets} multiline placeholder={"Launched reporting flow\nReduced manual review time\nCoordinated product and sales teams"} />
        <ActionRow>
          <Button label="Add role" onPress={addExperience} variant="secondary" />
          <Button label="Delete role" onPress={deleteExperience} variant="ghost" disabled={!cv.experience.length} />
        </ActionRow>
      </View>
      <ChoiceRail options={(cv.education.length ? cv.education : [{ id: "new", degree: "Education" }]).map((item, index) => ({ label: item.degree || `Education ${index + 1}`, value: String(index) }))} value={String(selectedEducation)} onChange={(value) => setSelectedEducation(Number(value))} />
      <Field label="Education" value={draftEducation} onChangeText={setDraftEducation} placeholder="BSc Business, Bogazici University, 2018" />
      <ActionRow>
        <Button label="Add edu" onPress={addEducation} variant="secondary" />
        <Button label="Delete edu" onPress={deleteEducation} variant="ghost" disabled={!cv.education.length} />
      </ActionRow>
      <AiCostHint />
      {!!message && <Text style={styles.status}>{message}</Text>}
      <ActionRow>
        <Button label="Import" onPress={importFile} variant="secondary" />
        <Button label="Save" onPress={save} />
        <Button label="Skills" onPress={organizeSkills} loading={loading} variant="ghost" />
      </ActionRow>
      <ActionRow>
        <Button label="Rewrite" onPress={next} variant="secondary" />
      </ActionRow>
    </Section>
  );
}

function BulletScreen({ next }: { next: () => void }) {
  const cv = useActiveCv();
  const settings = useAppStore((state) => state.settings);
  const updateCv = useAppStore((state) => state.updateCv);
  const addHistory = useAppStore((state) => state.addHistory);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const firstExperience = cv.experience[0];
  const initialBullets = firstExperience?.bullets.length ? firstExperience.bullets.join("\n") : "";
  const [source, setSource] = useState(initialBullets);
  const [rewritten, setRewritten] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const rewrite = async () => {
    if (!source.trim()) return;
    if (!spendCredit("rewriteBullets", "Bullet rewrite")) {
      setMessage("Credits required. Add credits in Settings to use AI.");
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "rewriteBullets",
      apiBaseUrl: settings.apiBaseUrl,
      provider: settings.aiProvider,
      input: { bullets: source, jobDescription: settings.lastJobDescription, tone: settings.tone }
    });
    const output = result.output;
    setRewritten(output);
    addHistory({ type: "rewrite", title: "Experience bullets rewritten", detail: output, ...aiHistoryMeta("rewriteBullets", result, source) });
    setMessage(result.status === "fallback" ? `${result.message} 1 credit used.` : "Bullets rewritten. 1 credit used.");
    setLoading(false);
  };

  const apply = () => {
    const bullets = splitLines(rewritten || source)
      .map(cleanBulletInput)
      .filter(Boolean);
    const experience = cv.experience.length
      ? cv.experience.map((item, index) => (index === 0 ? { ...item, bullets } : item))
      : [{ id: shortId("exp"), company: "", role: "", period: "", bullets }];
    updateCv({ ...cv, experience, rawText: cv.rawText || bullets.map((item) => `- ${item}`).join("\n") });
  };

  return (
    <Section>
      <Title title="Bullet Rewriter" subtitle="Turn rough bullets into clear impact." />
      <Field label="Current bullets" value={source} onChangeText={setSource} multiline placeholder={"Managed reports\nWorked with teams\nImproved process"} />
      {loading ? <Skeleton lines={4} /> : rewritten ? <Text style={styles.resultText}>{rewritten}</Text> : <EmptyState text="Paste 2-5 bullets and rewrite them for clarity." />}
      <AiCostHint />
      {!!message && <Text style={styles.status}>{message}</Text>}
      <ActionRow>
        <Button label="Rewrite" onPress={rewrite} loading={loading} />
        <Button label="Apply" onPress={apply} variant="secondary" disabled={!source.trim() && !rewritten.trim()} />
        <Button label="Job" onPress={next} variant="ghost" />
      </ActionRow>
    </Section>
  );
}

function JobScreen({ next }: { next: () => void }) {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const addHistory = useAppStore((state) => state.addHistory);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const analyze = async () => {
    if (!spendCredit("analyzeJob", "Job analysis")) {
      setMessage("Credits required. Add credits in Settings to use AI.");
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "analyzeJob",
      apiBaseUrl: settings.apiBaseUrl,
      provider: settings.aiProvider,
      input: { jobDescription: settings.lastJobDescription }
    });
    const output = result.output;
    setAnalysis(parseLooseJson<JobAnalysis>(output, { title: "Target role", company: "", mustHave: splitLines(output).slice(0, 4), niceToHave: [], keywords: [], risks: [] }));
    addHistory({ type: "job", title: "Job analyzed", detail: output, ...aiHistoryMeta("analyzeJob", result, settings.lastJobDescription) });
    setMessage(result.status === "fallback" ? `${result.message} 1 credit used.` : "Job analyzed. 1 credit used.");
    setLoading(false);
  };

  return (
    <Section>
      <Title title="Job Description" subtitle="Paste the target role." />
      <Field label="Job description" value={settings.lastJobDescription} onChangeText={(lastJobDescription) => updateSettings({ lastJobDescription })} multiline placeholder="Paste the role..." />
      {loading ? <Skeleton /> : analysis ? <InsightList title="Role signals" items={[...analysis.mustHave, ...analysis.keywords].slice(0, 8)} /> : <EmptyState text="Run analysis to extract must-haves and keywords." />}
      <AiCostHint />
      {!!message && <Text style={styles.status}>{message}</Text>}
      <ActionRow>
        <Button label="Analyze" onPress={analyze} loading={loading} />
        <Button label="Next" onPress={next} variant="secondary" />
      </ActionRow>
    </Section>
  );
}

function OptimizeScreen({ next }: { next: () => void }) {
  const cv = useActiveCv();
  const settings = useAppStore((state) => state.settings);
  const updateCv = useAppStore((state) => state.updateCv);
  const addHistory = useAppStore((state) => state.addHistory);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const [output, setOutput] = useState("");
  const [draft, setDraft] = useState<OptimizedCvDraft | null>(null);
  const [applyScope, setApplyScope] = useState<"all" | "summary" | "skills" | "bullets">("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const optimize = async () => {
    if (!spendCredit("optimizeCv", "CV optimization")) {
      setMessage("Credits required. Add credits in Settings to use AI.");
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "optimizeCv",
      apiBaseUrl: settings.apiBaseUrl,
      provider: settings.aiProvider,
      input: { cv, jobDescription: settings.lastJobDescription, tone: settings.tone }
    });
    const response = result.output;
    const parsed = parseLooseJson<OptimizedCvDraft>(response, {
      summary: response,
      skills: cv.skills,
      experience: cv.experience,
      notes: ["AI returned text instead of structured JSON. The text was kept as the optimized summary."]
    });
    setOutput(response);
    setDraft(parsed);
    addHistory({ type: "optimize", title: "CV optimized", detail: response, ...aiHistoryMeta("optimizeCv", result, cv.name) });
    setMessage(result.status === "fallback" ? `${result.message} 1 credit used.` : "CV optimized. 1 credit used.");
    setLoading(false);
  };

  const apply = () => {
    if (!draft) return;
    updateCv({
      ...cv,
      summary: applyScope === "all" || applyScope === "summary" ? draft.summary || cv.summary : cv.summary,
      skills: applyScope === "all" || applyScope === "skills" ? draft.skills?.length ? draft.skills : cv.skills : cv.skills,
      experience: applyScope === "all" || applyScope === "bullets" ? draft.experience?.length ? draft.experience.map((item, index) => ({ ...item, id: item.id || cv.experience[index]?.id || shortId("exp") })) : cv.experience : cv.experience,
      rawText: output || cv.rawText
    });
    setMessage(`${applyScope} changes applied locally.`);
  };

  return (
    <Section>
      <Title title="Optimization" subtitle="Rewrite for the job without inflating claims." />
      <Text style={styles.mutedLine}>Keep claims realistic. Do not invent metrics.</Text>
      {loading ? <Skeleton lines={6} /> : draft ? (
        <>
          <OptimizationStats cv={cv} draft={draft} jobDescription={settings.lastJobDescription} />
          <OptimizedPreview draft={draft} />
          <Segmented options={[{ label: "All", value: "all" }, { label: "Summary", value: "summary" }, { label: "Skills", value: "skills" }, { label: "Bullets", value: "bullets" }]} value={applyScope} onChange={setApplyScope} />
        </>
      ) : <EmptyState text="Generate a job-specific draft when the profile, CV, and job are ready." />}
      <AiCostHint />
      {!!message && <Text style={styles.status}>{message}</Text>}
      <ActionRow>
        <Button label="Generate" onPress={optimize} loading={loading} />
        <Button label="Apply" onPress={apply} variant="secondary" disabled={!draft} />
        <Button label="Next" onPress={next} variant="ghost" />
      </ActionRow>
    </Section>
  );
}

function AtsScreen({ next }: { next: () => void }) {
  const cv = useActiveCv();
  const settings = useAppStore((state) => state.settings);
  const updateCv = useAppStore((state) => state.updateCv);
  const addHistory = useAppStore((state) => state.addHistory);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const [report, setReport] = useState<AtsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const run = async () => {
    if (!spendCredit("atsCheck", "ATS check")) {
      setMessage("Credits required. Add credits in Settings to use AI.");
      return;
    }
    setLoading(true);
    const result = await generateAIResult({
      task: "atsCheck",
      apiBaseUrl: settings.apiBaseUrl,
      provider: settings.aiProvider,
      input: { cv, jobDescription: settings.lastJobDescription }
    });
    const output = result.output;
    const parsed = parseLooseJson<AtsReport>(output, { score: 68, strengths: ["Readable content"], fixes: splitLines(output).slice(0, 4), missingKeywords: [] });
    setReport(enrichAtsReport(parsed, cv));
    addHistory({ type: "ats", title: "ATS checked", detail: output, ...aiHistoryMeta("atsCheck", result, cv.name) });
    setMessage(result.status === "fallback" ? `${result.message} 1 credit used.` : "ATS check complete. 1 credit used.");
    setLoading(false);
  };

  const addMissingKeywords = () => {
    if (!report?.missingKeywords.length) return;
    const current = new Set(cv.skills.map((skill) => skill.toLocaleLowerCase("tr")));
    const additions = report.missingKeywords.filter((keyword) => !current.has(keyword.toLocaleLowerCase("tr")));
    updateCv({ ...cv, skills: [...cv.skills, ...additions] });
    setMessage(additions.length ? "Missing keywords added to skills." : "Keywords are already in skills.");
    addHistory({ type: "ats", title: "ATS keywords applied", detail: additions.join(", ") || "No new keywords" });
  };

  return (
    <Section>
      <Title title="ATS Check" subtitle="Fast scan for clarity, keywords, and structure." />
      {loading ? <Skeleton lines={4} /> : report ? (
        <View>
          <Text style={styles.score}>{report.score}</Text>
          <InsightList title="Fix next" items={report.fixes} />
          <InsightList title="Missing keywords" items={report.missingKeywords} />
          <InsightList title="Formatting issues" items={report.formattingIssues ?? []} />
          <InsightList title="Risky phrases" items={report.riskyPhrases ?? []} />
          <InsightList title="Action items" items={report.actionItems ?? []} />
        </View>
      ) : <EmptyState text="Run the ATS check after optimization." />}
      <AiCostHint />
      {!!message && <Text style={styles.status}>{message}</Text>}
      <ActionRow>
        <Button label="Scan" onPress={run} loading={loading} />
        <Button label="Add terms" onPress={addMissingKeywords} variant="secondary" disabled={!report?.missingKeywords.length} />
        <Button label="Next" onPress={next} variant="secondary" />
      </ActionRow>
    </Section>
  );
}

function ExportScreen({ next }: { next: () => void }) {
  const cv = useActiveCv();
  const profile = useAppStore((state) => state.profile);
  const state = useAppStore();
  const updateCv = useAppStore((item) => item.updateCv);
  const addHistory = useAppStore((item) => item.addHistory);
  const [message, setMessage] = useState("");
  const [textPreviewOpen, setTextPreviewOpen] = useState(false);

  const templateOptions = useMemo(
    () => Object.entries(templates).map(([value, item]) => ({ value: value as TemplateId, label: item.label })),
    []
  );
  const orderOptions = useMemo(
    () => [
      { label: "Standard", value: "summary,skills,experience,education" },
      { label: "Experience first", value: "summary,experience,skills,education" },
      { label: "Skills first", value: "summary,skills,education,experience" }
    ],
    []
  );
  const spacingOptions = useMemo(
    () => [
      { label: "Compact", value: "ats-compact" as TemplateId },
      { label: "Balanced", value: "ats-balanced" as TemplateId },
      { label: "Spacious", value: "ats-spacious" as TemplateId }
    ],
    []
  );
  const warnings = getExportWarnings(profile, cv);
  const textPreview = previewTextExport(profile, cv);

  const exportAndLog = async (kind: "pdf" | "text" | "json") => {
    const msg = kind === "pdf" ? await exportPdf(profile, cv) : kind === "text" ? await exportText(profile, cv) : await exportJson(state);
    setMessage(msg);
    addHistory({ type: "export", title: `${kind.toUpperCase()} export`, detail: msg });
  };

  return (
    <Section>
      <Title title="Export" subtitle="Pick a mode, check the preview, export fast." />
      <Segmented<CvMode> options={[{ label: "ATS Mode", value: "ats" }, { label: "Human Mode", value: "human" }]} value={cv.mode} onChange={(mode) => updateCv({ ...cv, mode, templateId: mode === "ats" ? "ats-balanced" : "human-focus" })} />
      <View style={{ height: 12 }} />
      <Text style={styles.subheadCompact}>Template</Text>
      <ChoiceRail<TemplateId> options={templateOptions} value={cv.templateId} onChange={(templateId) => updateCv({ ...cv, templateId })} />
      {cv.mode === "ats" ? (
        <>
          <Text style={styles.subheadCompact}>Spacing</Text>
          <ChoiceRail<TemplateId> options={spacingOptions} value={cv.templateId} onChange={(templateId) => updateCv({ ...cv, templateId })} />
        </>
      ) : null}
      <Text style={styles.subheadCompact}>Order</Text>
      <ChoiceRail options={orderOptions} value={cv.sectionOrder.join(",")} onChange={(value) => updateCv({ ...cv, sectionOrder: value.split(",") as CvSectionId[] })} />
      <ExportWarnings warnings={warnings} />
      <CvPreview profile={profile} cv={cv} />
      {textPreviewOpen ? (
        <View style={styles.textPreviewBox}>
          <Text style={styles.previewLabel}>Text preview</Text>
          <Text style={styles.textPreviewText}>{textPreview}</Text>
        </View>
      ) : null}
      {!!message && <Text style={styles.status}>{message}</Text>}
      <ActionRow>
        <Button label="PDF" onPress={() => exportAndLog("pdf")} />
        <Button label="Text" onPress={() => exportAndLog("text")} variant="secondary" />
        <Button label="JSON" onPress={() => exportAndLog("json")} variant="ghost" />
        <Button label={textPreviewOpen ? "Hide text" : "Show text"} onPress={() => setTextPreviewOpen((value) => !value)} variant="ghost" />
        <Button label="Copy" onPress={async () => setMessage(await copyTextExport(profile, cv))} variant="ghost" />
      </ActionRow>
      <ActionRow>
        <Button label="Prep" onPress={next} variant="secondary" />
      </ActionRow>
    </Section>
  );
}

function getExportWarnings(profile: Profile, cv: Cv) {
  return [
    !profile.fullName ? "Name is missing." : "",
    !profile.email && !profile.phone ? "Add at least one contact method." : "",
    !cv.summary && !profile.summary ? "Summary is missing." : "",
    !cv.skills.length ? "Skills are missing." : "",
    !cv.experience.length || cv.experience.every((item) => !item.bullets.length) ? "Experience bullets are missing." : ""
  ].filter(Boolean);
}

function ExportWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return <Text style={styles.readyLine}>Preview looks ready to export.</Text>;
  return (
    <View style={styles.warningBox}>
      <Text style={styles.warningTitle}>Before export</Text>
      {warnings.map((warning) => <Text key={warning} style={styles.warningText}>- {warning}</Text>)}
    </View>
  );
}

function CvPreview({ profile, cv }: { profile: Profile; cv: Cv }) {
  const template = templates[cv.templateId];
  const human = template.mode === "human";
  const contact = [profile.email, profile.phone, profile.location, profile.links].filter(Boolean).join(" | ");

  return (
    <View style={[styles.cvPaper, styles.cvPaperCompact, human && styles.cvPaperHuman]}>
      <View style={[styles.cvHeader, human && styles.cvHeaderHuman]}>
        <Text style={styles.cvName}>{profile.fullName || "Your Name"}</Text>
        {!!profile.title && <Text style={styles.cvTitle}>{profile.title}</Text>}
        {!!contact && <Text style={styles.cvMeta}>{contact}</Text>}
      </View>
      {cv.sectionOrder.map((section) => <CvPreviewContent key={section} section={section} profile={profile} cv={cv} human={human} />)}
    </View>
  );
}

function CvPreviewContent({ section, profile, cv, human }: { section: CvSectionId; profile: Profile; cv: Cv; human: boolean }) {
  if (section === "summary") {
    return <CvPreviewSection title="Summary"><Text style={styles.cvBody}>{cv.summary || profile.summary || "Add a focused summary before export."}</Text></CvPreviewSection>;
  }
  if (section === "skills") {
    return (
      <CvPreviewSection title="Skills">
        <View style={human ? styles.skillWrap : undefined}>
          {cv.skills.length ? cv.skills.map((skill) => (
            <Text key={skill} style={human ? styles.skillPill : styles.cvBody}>{human ? skill : `- ${skill}`}</Text>
          )) : <Text style={styles.cvBody}>Add role-relevant skills.</Text>}
        </View>
      </CvPreviewSection>
    );
  }
  if (section === "experience") {
    return (
      <CvPreviewSection title="Experience">
        {cv.experience.length ? cv.experience.map((item) => (
          <View key={item.id} style={styles.cvExperience}>
            <Text style={styles.cvRole}>{[item.role, item.company].filter(Boolean).join(" | ") || "Experience"}</Text>
            {!!item.period && <Text style={styles.cvMeta}>{item.period}</Text>}
            {item.bullets.map((bullet) => <Text key={bullet} style={styles.cvBody}>- {bullet}</Text>)}
          </View>
        )) : <Text style={styles.cvBody}>Add recent experience bullets.</Text>}
      </CvPreviewSection>
    );
  }
  return (
    <CvPreviewSection title="Education">
      {cv.education.length ? cv.education.map((item) => (
        <Text key={item.id} style={styles.cvBody}>{[item.degree, item.school, item.period].filter(Boolean).join(", ")}</Text>
      )) : <Text style={styles.cvBody}>Education can stay empty if it is not relevant.</Text>}
    </CvPreviewSection>
  );
}

function CvPreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.cvSection}>
      <Text style={styles.cvSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InterviewScreen() {
  const cv = useActiveCv();
  const settings = useAppStore((state) => state.settings);
  const spendCredit = useAppStore((state) => state.spendCredit);
  const addHistory = useAppStore((state) => state.addHistory);
  const [pack, setPack] = useState<InterviewPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedPair, setSelectedPair] = useState(0);
  const [starSituation, setStarSituation] = useState("");
  const [starTask, setStarTask] = useState("");
  const [starAction, setStarAction] = useState("");
  const [starResult, setStarResult] = useState("");

  const generate = async () => {
    if (!spendCredit("interviewQuestions", "Interview question generation")) {
      setMessage("Credits required. Add credits in Settings to use AI.");
      return;
    }
    setLoading(true);
    const questionResult = await generateAIResult({
      task: "interviewQuestions",
      apiBaseUrl: settings.apiBaseUrl,
      provider: settings.aiProvider,
      input: { cv, jobDescription: settings.lastJobDescription }
    });
    const questions = questionResult.output;
    const parsedQuestions = parseLooseJson<{ categories: InterviewCategory[] }>(questions, {
      categories: categorizeQuestions(splitLines(questions))
    });
    const flatQuestions = parsedQuestions.categories.flatMap((category) => category.items);
    const answerResult = await generateAIResult({
      task: "interviewAnswers",
      apiBaseUrl: settings.apiBaseUrl,
      provider: settings.aiProvider,
      input: { questions: flatQuestions, cv, jobDescription: settings.lastJobDescription }
    });
    const answers = answerResult.output;
    const answerLines = splitLines(answers);
    const qaPairs = flatQuestions.map((question, index) => ({
      category: parsedQuestions.categories.find((category) => category.items.includes(question))?.title ?? "Behavioral",
      question,
      answer: answerLines[index] ?? answerLines[0] ?? ""
    }));
    setPack({ categories: parsedQuestions.categories, answers: answerLines, qaPairs });
    setSelectedPair(0);
    addHistory({ type: "interview", title: "Interview pack", detail: `${questions}\n\n${answers}`, ...aiHistoryMeta("interviewQuestions", questionResult, cv.name) });
    setMessage(questionResult.status === "fallback" || answerResult.status === "fallback" ? "Interview prep used a safe fallback. 1 credit used." : "Interview prep generated. 1 credit used.");
    setLoading(false);
  };

  const improveAnswer = async () => {
    if (!pack?.qaPairs?.length) return;
    if (!spendCredit("interviewAnswers", "Interview answer improvement")) {
      setMessage("Credits required. Add credits in Settings to use AI.");
      return;
    }
    setLoading(true);
    const pair = pack.qaPairs[selectedPair];
    const starDraft = buildStarDraft(starSituation, starTask, starAction, starResult);
    const result = await generateAIResult({
      task: "interviewAnswers",
      apiBaseUrl: settings.apiBaseUrl,
      provider: settings.aiProvider,
      input: {
        questions: [pair.question],
        currentAnswer: pair.answer,
        starDraft,
        cv,
        jobDescription: settings.lastJobDescription
      }
    });
    const improved = splitLines(result.output)[0] ?? result.output;
    const qaPairs = pack.qaPairs.map((item, index) => (index === selectedPair ? { ...item, answer: improved } : item));
    setPack({ ...pack, qaPairs, answers: qaPairs.map((item) => item.answer) });
    setMessage(result.status === "fallback" ? `${result.message} 1 credit used.` : "Answer improved. 1 credit used.");
    addHistory({ type: "interview", title: "Interview answer improved", detail: improved, ...aiHistoryMeta("interviewAnswers", result, pair.question) });
    setLoading(false);
  };

  return (
    <Section>
      <Title title="Interview Prep" subtitle="Generate questions and tighten answers." />
      {loading ? <Skeleton lines={6} /> : pack ? (
        <>
          {pack.categories.map((category) => <InsightList key={category.title} title={category.title} items={category.items} />)}
          {pack.qaPairs?.length ? (
            <>
              <Text style={styles.subheadCompact}>Answer pair</Text>
              <ChoiceRail options={pack.qaPairs.map((pair, index) => ({ label: `${index + 1}`, value: String(index) }))} value={String(selectedPair)} onChange={(value) => setSelectedPair(Number(value))} />
              <InterviewAnswerCard pair={pack.qaPairs[selectedPair]} />
              <Text style={styles.subheadCompact}>STAR notes</Text>
              <Field label="Situation" value={starSituation} onChangeText={setStarSituation} multiline placeholder="What was happening?" />
              <Field label="Task" value={starTask} onChangeText={setStarTask} multiline placeholder="What were you owning?" />
              <Field label="Action" value={starAction} onChangeText={setStarAction} multiline placeholder="What did you do?" />
              <Field label="Result" value={starResult} onChangeText={setStarResult} multiline placeholder="What changed?" />
              <ActionRow>
                <Button label="Improve" onPress={improveAnswer} variant="secondary" />
                <Button label="Copy" onPress={() => copyText(pack.qaPairs?.[selectedPair]?.answer || "").then(setMessage)} variant="ghost" />
              </ActionRow>
            </>
          ) : <InsightList title="Answer starters" items={pack.answers} />}
        </>
      ) : <EmptyState text="Create prep from the optimized CV and job description." />}
      <AiCostHint />
      {!!message && <Text style={styles.status}>{message}</Text>}
      <ActionRow>
        <Button label="Generate" onPress={generate} loading={loading} />
      </ActionRow>
    </Section>
  );
}

function InterviewAnswerCard({ pair }: { pair?: { category: InterviewCategory["title"]; question: string; answer: string } }) {
  if (!pair) return null;
  return (
    <View style={[styles.answerCard, styles.answerCardCompact]}>
      <Text style={styles.previewLabel}>{pair.category}</Text>
      <Text style={styles.historyTitle}>{pair.question}</Text>
      <Text style={styles.previewText}>{pair.answer}</Text>
    </View>
  );
}

function categorizeQuestions(questions: string[]): InterviewCategory[] {
  return [
    { title: "Behavioral", items: questions.slice(0, 2) },
    { title: "Technical", items: questions.slice(2, 4) },
    { title: "Role Fit", items: questions.slice(4, 6) }
  ].filter((category) => category.items.length > 0) as InterviewCategory[];
}

function AiCostHint() {
  const credits = useAppStore((state) => state.settings.credits);
  return (
    <View style={[styles.costHint, credits <= 0 && styles.costHintEmpty]}>
      <Text style={[styles.costHintText, credits <= 0 && styles.costHintTextEmpty]}>
        {credits > 0 ? "AI action uses 1 credit." : "No credits left. Add credits in Settings."}
      </Text>
    </View>
  );
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

function buildStarDraft(situation: string, task: string, action: string, result: string) {
  return [
    situation ? `Situation: ${situation}` : "",
    task ? `Task: ${task}` : "",
    action ? `Action: ${action}` : "",
    result ? `Result: ${result}` : ""
  ].filter(Boolean).join("\n");
}

async function copyText(value: string) {
  await Clipboard.setStringAsync(value);
  return "Copied.";
}

function HistoryScreen() {
  const history = useAppStore((state) => state.history);
  const [filter, setFilter] = useState<"all" | "optimize" | "ats" | "interview" | "export">("all");
  const filteredHistory = filter === "all" ? history : history.filter((item) => item.type === filter);
  return (
    <Section>
      <Title title="History" subtitle="Recent local actions. Stays on this device." />
      <ChoiceRail
        value={filter}
        onChange={setFilter}
        options={[
          { label: "All", value: "all" },
          { label: "Draft", value: "optimize" },
          { label: "ATS", value: "ats" },
          { label: "Prep", value: "interview" },
          { label: "Export", value: "export" }
        ]}
      />
      {filteredHistory.length ? filteredHistory.map((item) => (
        <View key={item.id} style={styles.historyRowCompact}>
          <Text style={styles.historyTitle}>{item.title}</Text>
          <Text style={styles.historyMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
          <Text numberOfLines={2} style={styles.historyDetail}>{item.detail}</Text>
        </View>
      )) : <EmptyState text="No matching history yet." />}
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

  const buy = async (productId: ProductId) => {
    const result = await purchaseCredits(productId);
    if (result.ok) restoreCredits(settings.credits + result.credits, "purchase", `Purchased ${result.credits} credits`);
    setMessage(result.message);
  };

  const restore = async () => {
    const result = await restorePurchases();
    if (result.ok) restoreCredits(result.credits, "restore", `Restored ${result.credits} credits`);
    setMessage(result.message);
  };

  const testProvider = async () => {
    try {
      const response = await fetch(`${settings.apiBaseUrl}/api/provider-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ provider: settings.aiProvider })
      });
      const data = (await response.json()) as { ok?: boolean; provider?: string; model?: string; error?: string };
      setMessage(data.ok ? `${data.provider} connected with ${data.model}.` : data.error || "Provider test failed.");
    } catch {
      setMessage("Could not reach the API server.");
    }
  };

  const importBackup = async () => {
    try {
      const data = await pickJsonBackup();
      if (!data) return;
      importLocalData(data, backupMode);
      const cvCount = data.cvs?.length ?? 0;
      const historyCount = data.history?.length ?? 0;
      setMessage(`Backup ${backupMode} complete. ${cvCount} CVs, ${historyCount} history items.`);
    } catch {
      setMessage("Could not import this backup file.");
    }
  };

  return (
    <Section>
      <Title title="Settings" subtitle="Provider, backups, and credits." />
      <Field label="API URL" value={settings.apiBaseUrl} onChangeText={(apiBaseUrl) => updateSettings({ apiBaseUrl })} />
      <Text style={styles.subheadCompact}>Provider</Text>
      <Segmented options={[{ label: "Groq", value: "groq" }, { label: "OpenAI", value: "openai" }]} value={settings.aiProvider} onChange={(aiProvider) => updateSettings({ aiProvider })} />
      <View style={{ height: 12 }} />
      <Text style={styles.subheadCompact}>Tone</Text>
      <Segmented options={[{ label: "Direct", value: "direct" }, { label: "Executive", value: "executive" }, { label: "Technical", value: "technical" }]} value={settings.tone} onChange={(tone) => updateSettings({ tone })} />
      <Text style={styles.subheadCompact}>Backup</Text>
      <Segmented options={[{ label: "Merge", value: "merge" }, { label: "Replace", value: "replace" }]} value={backupMode} onChange={setBackupMode} />
      <Text style={styles.subheadCompact}>Credits</Text>
      <Text style={styles.mutedLine}>Balance: {settings.credits}. Standard AI action: 1 credit.</Text>
      <View style={styles.productGrid}>
        {(Object.entries(creditProducts) as [ProductId, (typeof creditProducts)[ProductId]][]).map(([productId, product]) => (
          <Pressable key={productId} onPress={() => buy(productId)} style={styles.productOption}>
            <Text style={styles.productTitle}>{product.label}</Text>
            <Text style={styles.productDescription}>{product.description}</Text>
          </Pressable>
        ))}
      </View>
      {!canAfford("profileSummary") ? <Text style={styles.warningText}>No-credit state: AI features are paused until you add or restore credits.</Text> : null}
      {!!message && <Text style={styles.status}>{message}</Text>}
      <ActionRow>
        <Button label="Test" onPress={testProvider} />
        <Button label="Restore" onPress={restore} variant="secondary" />
        <Button label="Import" onPress={importBackup} variant="secondary" />
        <Button label="Reset" onPress={resetLocalData} variant="ghost" />
      </ActionRow>
      <Text style={styles.subheadCompact}>Activity</Text>
      {creditTransactions.length ? creditTransactions.map((item) => (
        <View key={item.id} style={styles.historyRowCompact}>
          <Text style={styles.historyTitle}>{item.note}</Text>
          <Text style={styles.historyMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
          <Text style={styles.historyDetail}>{item.amount > 0 ? `+${item.amount}` : item.amount} credits</Text>
        </View>
      )) : <EmptyState text="No credit activity yet." />}
    </Section>
  );
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

function OptimizedPreview({ draft }: { draft: OptimizedCvDraft }) {
  const firstExperience = draft.experience?.[0];
  return (
    <View style={styles.previewBlock}>
      {!!draft.summary && (
        <>
          <Text style={styles.previewLabel}>Summary</Text>
          <Text style={styles.previewText}>{draft.summary}</Text>
        </>
      )}
      <InsightList title="Skills" items={draft.skills ?? []} />
      {firstExperience ? (
        <View style={styles.insights}>
          <Text style={styles.insightTitle}>{[firstExperience.role, firstExperience.company].filter(Boolean).join(" | ") || "Experience"}</Text>
          {firstExperience.bullets.map((bullet) => (
            <Text key={bullet} style={styles.insightItem}>- {bullet}</Text>
          ))}
        </View>
      ) : null}
      <InsightList title="Notes" items={draft.notes ?? []} />
    </View>
  );
}

function cleanBulletInput(line: string) {
  return line.replace(/^[-*\d.)\s]+/, "").replace(/^\u2022\s*/, "").trim();
}

function OptimizationStats({ cv, draft, jobDescription }: { cv: Cv; draft: OptimizedCvDraft; jobDescription: string }) {
  const addedSkills = draft.skills.filter((skill) => !cv.skills.some((current) => current.toLocaleLowerCase("tr") === skill.toLocaleLowerCase("tr")));
  const coverage = getKeywordCoverage(jobDescription, draft);
  const bulletDelta = (draft.experience[0]?.bullets.length ?? 0) - (cv.experience[0]?.bullets.length ?? 0);

  return (
    <View style={styles.optimizationStats}>
      <Text style={styles.optimizationStatText}>Keyword coverage: {coverage}%</Text>
      <Text style={styles.optimizationStatText}>Added skills: {addedSkills.length}</Text>
      <Text style={styles.optimizationStatText}>Bullet delta: {bulletDelta >= 0 ? `+${bulletDelta}` : bulletDelta}</Text>
      {!!addedSkills.length && <Text style={styles.optimizationStatSub}>{addedSkills.slice(0, 6).join(" | ")}</Text>}
    </View>
  );
}

function getKeywordCoverage(jobDescription: string, draft: OptimizedCvDraft) {
  const keywords = splitCsv(jobDescription).filter((word) => word.length > 3).slice(0, 18);
  if (!keywords.length) return 0;
  const haystack = `${draft.summary} ${draft.skills.join(" ")} ${draft.experience.flatMap((item) => item.bullets).join(" ")}`.toLocaleLowerCase("tr");
  const matched = keywords.filter((keyword) => haystack.includes(keyword.toLocaleLowerCase("tr")));
  return Math.round((matched.length / keywords.length) * 100);
}

function enrichAtsReport(report: AtsReport, cv: Cv): AtsReport {
  const formattingIssues = [...(report.formattingIssues ?? [])];
  const riskyPhrases = [...(report.riskyPhrases ?? [])];
  const actionItems = [...(report.actionItems ?? [])];
  const raw = cv.rawText.toLocaleLowerCase("tr");

  if (cv.rawText.length > 4000) formattingIssues.push("CV is quite long. Trim less relevant detail.");
  if (cv.experience.some((item) => item.bullets.length > 6)) formattingIssues.push("Some roles have too many bullets.");
  for (const phrase of ["hardworking", "team player", "responsible for", "helped with"]) {
    if (raw.includes(phrase)) riskyPhrases.push(`Replace weak phrase: ${phrase}`);
  }
  if (!actionItems.length) {
    actionItems.push("Keep each bullet short and outcome-oriented.");
    if (report.missingKeywords?.length) actionItems.push("Add the strongest missing keywords naturally into summary or experience.");
  }

  return {
    ...report,
    formattingIssues: uniqueStrings(formattingIssues),
    riskyPhrases: uniqueStrings(riskyPhrases),
    actionItems: uniqueStrings(actionItems)
  };
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function upsertAt<T>(items: T[], index: number, value: T) {
  const next = [...items];
  next[index] = value;
  return next;
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRail}>
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
    </ScrollView>
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
    maxHeight: 88,
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
    paddingVertical: 9,
    paddingHorizontal: 10
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
    minWidth: 72,
    minHeight: 60,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "column",
    gap: 4
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
    minWidth: 24,
    height: 24,
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
    fontSize: 11,
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
  headerTextWrap: {
    gap: 2
  },
  headerBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  headerBrandTextWrap: {
    gap: 2
  },
  brand: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 8
  },
  headerLogo: {
    width: 108,
    height: 28
  },
  headerStep: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  loadingLogo: {
    width: 136,
    height: 40,
    marginBottom: 8
  },
  brandCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.white
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 10
  },
  brandLogo: {
    width: 116,
    height: 32
  },
  heroPanel: {
    borderWidth: 1,
    borderColor: "#DCE3F1",
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10
  },
  heroBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 12
  },
  heroLogo: {
    width: 122,
    height: 32
  },
  heroLine: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700"
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
    marginVertical: 10
  },
  costHint: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 2
  },
  costHintEmpty: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2"
  },
  costHintText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
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
    gap: 10,
    marginBottom: 12
  },
  productOption: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 14
  },
  productTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4
  },
  productDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
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
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 18
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
    marginTop: 8,
    marginBottom: 8
  },
  builderGroup: {
    borderLeftWidth: 1,
    borderLeftColor: "#C7D2FE",
    paddingLeft: 12,
    marginBottom: 4
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12
  },
  actionsCompact: {
    flexDirection: "column"
  },
  choiceRail: {
    gap: 8,
    paddingVertical: 4
  },
  choice: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  choiceActive: {
    borderColor: colors.accent,
    backgroundColor: colors.soft
  },
  choiceText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
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
    textTransform: "uppercase",
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
