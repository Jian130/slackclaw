export interface DigitalEmployee {
  id: string;
  name: string;
  title: string;
  status: "ready" | "busy" | "idle";
  activeTasks: number;
  currentStatus: string;
  model: string;
  personalities: string[];
  workStyles: string[];
  skills: string[];
  avatarAccent: string;
}

export interface WorkspaceActivity {
  id: string;
  employeeId: string;
  employeeName: string;
  action: string;
  description: string;
  timestamp: string;
  tone: "completed" | "started" | "generated" | "updated" | "assigned";
}

export interface WorkspaceSkillDraft {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}

export interface WorkspaceSettingsState {
  general: {
    instanceName: string;
    autoStart: boolean;
    checkUpdates: boolean;
    telemetry: boolean;
  };
  deployment: {
    autoRestart: boolean;
    maxRetries: number;
    healthCheck: boolean;
  };
  logging: {
    level: string;
    retention: number;
    enableDebug: boolean;
  };
}

export interface WorkspaceState {
  teamVision: string;
  employees: DigitalEmployee[];
  activity: WorkspaceActivity[];
  skillEnabledIds: string[];
  customSkillDrafts: WorkspaceSkillDraft[];
  settings: WorkspaceSettingsState;
}

const STORAGE_KEY = "slackclaw.workspace";

function resolveStorage(): Storage | undefined {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }

  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    return globalThis.localStorage;
  }

  return undefined;
}

export const defaultWorkspaceState: WorkspaceState = {
  teamVision:
    "Empower every team member with AI assistants to unlock reliable, everyday productivity.",
  employees: [
    {
      id: "alex-morgan",
      name: "Alex Morgan",
      title: "Senior Research Analyst",
      status: "busy",
      activeTasks: 2,
      currentStatus: "Preparing competitor scan summary",
      model: "openai-codex/gpt-5.3-codex",
      personalities: ["Analytical", "Detail-Oriented"],
      workStyles: ["Methodical", "Data-Driven"],
      skills: ["Summarize Thread", "Research Brief", "Meeting Notes"],
      avatarAccent: "var(--avatar-1)"
    },
    {
      id: "jordan-chen",
      name: "Jordan Chen",
      title: "AI Technical Lead",
      status: "busy",
      activeTasks: 5,
      currentStatus: "Working on weekly reporting draft",
      model: "openai/gpt-4o",
      personalities: ["Strategic", "Innovative"],
      workStyles: ["Adaptive", "Fast-Paced"],
      skills: ["Data Analysis", "Task Automation", "Email Drafting"],
      avatarAccent: "var(--avatar-2)"
    },
    {
      id: "sarah-mitchell",
      name: "Sarah Mitchell",
      title: "Business Strategist",
      status: "ready",
      activeTasks: 0,
      currentStatus: "Ready for new assignments",
      model: "anthropic/claude-3-7-sonnet",
      personalities: ["Creative", "Collaborative"],
      workStyles: ["Systematic", "Flexible"],
      skills: ["Document Summarization", "Presentation Draft", "Meeting Notes"],
      avatarAccent: "var(--avatar-3)"
    },
    {
      id: "zhang-li",
      name: "Zhang Li",
      title: "Innovation Specialist",
      status: "idle",
      activeTasks: 0,
      currentStatus: "Waiting for a new innovation brief",
      model: "google/gemini-2.0-flash",
      personalities: ["Innovative", "Analytical"],
      workStyles: ["Structured", "Intuitive"],
      skills: ["Research Brief", "Idea Generator"],
      avatarAccent: "var(--avatar-4)"
    },
    {
      id: "alisa-davis",
      name: "Alisa Davis",
      title: "Operations Manager",
      status: "busy",
      activeTasks: 3,
      currentStatus: "Analyzing Q1 performance metrics",
      model: "anthropic/claude-3-5-sonnet",
      personalities: ["Assertive", "Detail-Oriented"],
      workStyles: ["Methodical", "Fast-Paced"],
      skills: ["Spreadsheet Cleanup", "Project Tracker", "Email Drafting"],
      avatarAccent: "var(--avatar-5)"
    }
  ],
  activity: [
    {
      id: "activity-1",
      employeeId: "jordan-chen",
      employeeName: "Jordan Chen",
      action: "Completed Task",
      description: "Generated comprehensive market analysis report",
      timestamp: "5 minutes ago",
      tone: "completed"
    },
    {
      id: "activity-2",
      employeeId: "alex-morgan",
      employeeName: "Alex Morgan",
      action: "Started Task",
      description: "Research competitor pricing strategies",
      timestamp: "12 minutes ago",
      tone: "started"
    },
    {
      id: "activity-3",
      employeeId: "alisa-davis",
      employeeName: "Alisa Davis",
      action: "Generated Output",
      description: "Created project timeline visualization",
      timestamp: "28 minutes ago",
      tone: "generated"
    }
  ],
  skillEnabledIds: [
    "draft-email",
    "summarize-thread",
    "meeting-notes",
    "research-brief",
    "spreadsheet-cleanup"
  ],
  customSkillDrafts: [],
  settings: {
    general: {
      instanceName: "My ChillClaw Workspace",
      autoStart: true,
      checkUpdates: true,
      telemetry: false
    },
    deployment: {
      autoRestart: true,
      maxRetries: 3,
      healthCheck: true
    },
    logging: {
      level: "info",
      retention: 30,
      enableDebug: false
    }
  }
};

export function loadWorkspaceState(): WorkspaceState | undefined {
  const storage = resolveStorage();
  if (!storage) {
    return undefined;
  }

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as WorkspaceState;
  } catch {
    return undefined;
  }
}

export function saveWorkspaceState(next: WorkspaceState) {
  const storage = resolveStorage();
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(next));
}
