import type { FocusTopic } from "@/lib/types";
export const POSITION_GROUPS: { label: string; roles: string[] }[] = [
  {
    label: "SOC & Security Analyst",
    roles: [
      "SOC Analyst L1",
      "SOC Analyst L2",
      "SOC Analyst L3",
      "Cybersecurity Analyst",
      "Security Analyst",
      "Security Operations Analyst",
      "Incident Response Analyst",
      "Threat Detection Analyst",
    ],
  },
  { label: "Penetration Testing", roles: ["Junior Penetration Tester", "Penetration Tester", "Senior Penetration Tester"] },
];
export const POSITIONS = POSITION_GROUPS.flatMap((g) => g.roles);
export const isPentest = (position: string) => position.includes("Penetration");
export const EXPERIENCE = ["No professional experience", "Entry Level", "1–2 Years", "3–5 Years", "5+ Years"];
export const DIFFICULTY = ["Beginner", "Intermediate", "Advanced", "Realistic / Adaptive", "Hard Mode"];
export const ENVIRONMENTS: { value: string; label: string; hint: string }[] = [
  { value: "random", label: "Random Company", hint: "Surprise me" },
  { value: "financial", label: "Financial Institution", hint: "BEC, fraud, cloud identity" },
  { value: "healthcare", label: "Healthcare", hint: "PHI, HIPAA, ransomware" },
  { value: "technology", label: "Technology Company", hint: "Cloud, SaaS, CI/CD" },
  { value: "government", label: "Government Contractor", hint: "CMMC, nation-state" },
  { value: "enterprise", label: "Enterprise", hint: "AD, ransomware, scale" },
  { value: "mssp", label: "MSSP", hint: "Multi-tenant, SLAs, volume" },
  { value: "startup", label: "Startup", hint: "Many hats, automation" },
];
export const MODES: { value: "full" | "quick" | "communication" | "technical"; label: string; desc: string; rounds: string }[] = [
  { value: "full", label: "Full Interview", desc: "Complete 4-stage hiring process with final decision.", rounds: "HR → Technical → SOC Investigation → Manager" },
  { value: "quick", label: "Quick Interview", desc: "Condensed technical + live investigation.", rounds: "Technical → SOC Investigation" },
  { value: "communication", label: "Communication Practice", desc: "Behavioral and professional communication focus.", rounds: "HR → Manager" },
  { value: "technical", label: "Technical Practice", desc: "Deep technical and investigation rounds.", rounds: "Technical → SOC Investigation" },
];

export const ROUND_LABEL: Record<string, string> = {
  hr: "HR Screening",
  technical: "Technical Interview",
  scenario: "SOC Investigation",
  manager: "Hiring Manager",
};

export const COMM_LABELS: Record<string, string> = {
  grammar: "Grammar",
  pronunciation_clarity: "Pronunciation Clarity",
  fluency: "Fluency",
  confidence: "Confidence",
  vocabulary: "Professional Vocabulary",
  speaking_pace: "Speaking Pace",
  filler_words: "Filler Words",
  structure: "Answer Structure",
  technical_explanation: "Technical Communication",
  behavioral: "Behavioral Communication",
  conciseness: "Conciseness",
  professionalism: "Professionalism",
};

export const MODULE_INFO: Record<string, { title: string; path: string }> = {
  tell_me_about_yourself: { title: "Tell Me About Yourself", path: "/practice?module=tell_me_about_yourself" },
  behavioral_star: { title: "Behavioral (STAR)", path: "/practice?module=behavioral_star" },
  technical_explanation: { title: "Technical Explanation", path: "/practice?module=technical_explanation" },
  non_technical_audience: { title: "Explain to Any Audience", path: "/practice?module=non_technical_audience" },
  pronunciation: { title: "Pronunciation Practice", path: "/practice?module=pronunciation" },
  rapid_interview: { title: "Rapid Interview", path: "/practice?module=rapid_interview" },
};

export const PRACTICE_PROMPTS: Record<string, string[]> = {
  tell_me_about_yourself: ["Tell me about yourself.", "Walk me through your background and why you're applying for this SOC role."],
  behavioral_star: [
    "Tell me about a time you handled a stressful situation at work.",
    "Describe a time you made a mistake and how you handled it.",
    "Tell me about a time you disagreed with a teammate.",
    "Describe a time you had to learn a new tool quickly.",
  ],
  technical_explanation: ["Explain DNS.", "Explain Kerberos.", "Explain what a SIEM does.", "Explain ransomware.", "Explain Active Directory.", "Explain the difference between IDS and IPS."],
  non_technical_audience: ["Explain a ransomware incident affecting our file servers."],
  pronunciation: [
    "Authentication", "Authorization", "Vulnerability", "Infrastructure", "Encryption", "Administrator", "Privilege",
    "Credentials", "Malicious", "Exfiltration", "Reconnaissance", "Remediation", "Escalation", "Investigation",
    "Kerberos", "PowerShell", "Cybersecurity", "Cryptography", "Ransomware", "Phishing",
  ],
};

export const AUDIENCES = ["CFO (non-technical executive)", "Senior SOC Analyst"];

export function decisionTone(d: string | null | undefined): string {
  switch (d) {
    case "STRONG HIRE":
      return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
    case "HIRE":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "BORDERLINE":
      return "border-amber-400/40 bg-amber-400/10 text-amber-300";
    case "NO HIRE":
      return "border-red-400/40 bg-red-400/10 text-red-300";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function scoreColor(n: number | null | undefined): string {
  if (n == null) return "text-muted-foreground";
  if (n >= 80) return "text-emerald-400";
  if (n >= 65) return "text-sky-300";
  if (n >= 50) return "text-amber-300";
  return "text-red-400";
}

export const FOCUS_OPTIONS: { value: FocusTopic | null; label: string; hint: string }[] = [
  { value: null, label: "General", hint: "Full role coverage" },
  { value: "Splunk", label: "Splunk", hint: "SPL, searches, correlation" },
  { value: "Wireshark", label: "Wireshark", hint: "PCAPs, filters, C2" },
  { value: "Nmap", label: "Nmap", hint: "Discovery, scans, NSE" },
  { value: "Active Directory", label: "Active Directory", hint: "Kerberos, GPO, attacks" },
  { value: "Python", label: "Python", hint: "Automation, parsing, APIs" },
];
