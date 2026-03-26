import { Globe, Loader2, PackagePlus, RefreshCw, Search, Settings2, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  InstalledSkillDetail,
  InstalledSkillEntry,
  SkillCatalogOverview,
  SkillMarketplaceDetail,
  SkillMarketplaceEntry
} from "@slackclaw/contracts";

import { useLocale } from "../../app/providers/LocaleProvider.js";
import {
  createCustomSkill,
  fetchInstalledSkillDetail,
  fetchMarketplaceSkillDetail,
  fetchSkillConfig,
  installMarketplaceSkill,
  removeSkill,
  searchMarketplaceSkills,
  updateSkill
} from "../../shared/api/client.js";
import { settleAfterMutation } from "../../shared/data/settle.js";
import { t } from "../../shared/i18n/messages.js";
import { Badge } from "../../shared/ui/Badge.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent } from "../../shared/ui/Card.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { EmptyState } from "../../shared/ui/EmptyState.js";
import { FieldLabel, Input, Textarea } from "../../shared/ui/Field.js";
import { MetricCard } from "../../shared/ui/MetricCard.js";
import { WorkspaceScaffold } from "../../shared/ui/Scaffold.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui/Tabs.js";

export function skillReadinessTone(skill: Pick<InstalledSkillEntry, "readiness">): "success" | "warning" | "neutral" {
  return skill.readiness === "ready" ? "success" : skill.readiness === "missing" ? "warning" : "neutral";
}

export function skillSourceLabel(skill: Pick<InstalledSkillEntry, "source">): string {
  switch (skill.source) {
    case "bundled":
      return "Bundled";
    case "clawhub":
      return "ClawHub";
    case "custom":
      return "Custom";
    case "extra":
      return "Extra";
    default:
      return "Workspace";
  }
}

export function skillMissingSummary(skill: Pick<InstalledSkillEntry, "missing" | "readiness">): string {
  if (skill.readiness === "ready") {
    return "Ready to use";
  }

  const missing = [
    skill.missing.bins.length > 0 ? `bins: ${skill.missing.bins.join(", ")}` : undefined,
    skill.missing.anyBins.length > 0 ? `anyBins: ${skill.missing.anyBins.join(", ")}` : undefined,
    skill.missing.env.length > 0 ? `env: ${skill.missing.env.join(", ")}` : undefined,
    skill.missing.config.length > 0 ? `config: ${skill.missing.config.join(", ")}` : undefined,
    skill.missing.os.length > 0 ? `os: ${skill.missing.os.join(", ")}` : undefined
  ].filter(Boolean);

  return missing.length > 0 ? missing.join(" · ") : "Unavailable";
}

export function filterMarketplaceSearchResults(results: SkillMarketplaceEntry[]): SkillMarketplaceEntry[] {
  const seen = new Set<string>();

  return results.filter((entry) => {
    if (entry.installed || seen.has(entry.slug)) {
      return false;
    }

    seen.add(entry.slug);
    return true;
  });
}

function skillEntrySignature(skill: InstalledSkillEntry | undefined) {
  if (!skill) {
    return "";
  }

  return JSON.stringify({
    id: skill.id,
    slug: skill.slug,
    readiness: skill.readiness,
    version: skill.version,
    disabled: skill.disabled,
    eligible: skill.eligible,
    missing: skill.missing
  });
}

function MarketplaceSkillDialog(props: {
  open: boolean;
  slug?: string;
  onClose: () => void;
  onInstalled: (catalog: SkillCatalogOverview) => void;
  reloadSkills: (options?: { fresh?: boolean }) => Promise<SkillCatalogOverview>;
}) {
  const [detail, setDetail] = useState<SkillMarketplaceDetail>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!props.open || !props.slug) {
      setDetail(undefined);
      setError(undefined);
      return;
    }

    void fetchMarketplaceSkillDetail(props.slug)
      .then((next) => {
        setDetail(next);
        setError(undefined);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "ChillClaw could not inspect this marketplace skill.");
      });
  }, [props.open, props.slug]);

  async function handleInstall() {
    if (!detail) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const response = await settleAfterMutation({
        mutate: () => installMarketplaceSkill({ slug: detail.slug }),
        getProvisionalState: (mutation) => mutation.skillConfig,
        applyState: props.onInstalled,
        readFresh: () => props.reloadSkills({ fresh: true }),
        isSettled: (state) => state.installedSkills.some((skill) => skill.slug === detail.slug),
        attempts: 8,
        delayMs: 700
      });
      props.onInstalled(response.state);
      props.onClose();
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : "ChillClaw could not install this skill.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={detail?.name ?? props.slug ?? "Marketplace Skill"}
      description="Review the marketplace skill before installing it into ChillClaw’s shared OpenClaw skills library."
      wide
    >
      <div className="panel-stack">
        {error ? <p className="card__description" style={{ color: "var(--danger)" }}>{error}</p> : null}
        {detail ? (
          <>
            <div className="actions-row" style={{ justifyContent: "space-between" }}>
              <div className="panel-stack" style={{ gap: 4 }}>
                <strong>{detail.name}</strong>
                <span className="card__description">{detail.summary}</span>
              </div>
              <Badge tone={detail.curated ? "success" : "warning"}>
                {detail.curated ? "Curated-first" : "Review carefully"}
              </Badge>
            </div>

            <div className="actions-row">
              {detail.latestVersion ? <Badge tone="neutral">v{detail.latestVersion}</Badge> : null}
              {detail.ownerHandle ? <Badge tone="neutral">@{detail.ownerHandle}</Badge> : null}
              {typeof detail.downloads === "number" ? <Badge tone="neutral">{detail.downloads} downloads</Badge> : null}
              {typeof detail.stars === "number" ? <Badge tone="neutral">{detail.stars} stars</Badge> : null}
            </div>

            {detail.changelog ? <p className="card__description">{detail.changelog}</p> : null}
            {detail.filePreview ? (
              <pre className="card__description" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {detail.filePreview.slice(0, 1600)}
              </pre>
            ) : null}

            <p className="card__description">
              ChillClaw installs third-party skills into the shared OpenClaw skills directory. Review the owner, changelog, and preview before you install.
            </p>

            <div className="actions-row" style={{ justifyContent: "flex-end" }}>
              <Button variant="outline" onClick={props.onClose}>Close</Button>
              <Button onClick={() => void handleInstall()} disabled={busy || detail.installed}>
                <PackagePlus size={14} />
                {detail.installed ? "Already Installed" : busy ? "Installing..." : "Install Skill"}
              </Button>
            </div>
          </>
        ) : (
          <div className="skills-loading-card skills-loading-card--inline">
            <div className="skills-loading-card__content">
              <Loader2 className="skills-loading-card__spinner" size={20} />
              <div className="skills-loading-card__meta">
                <strong>Checking marketplace skill</strong>
                <p className="card__description">ChillClaw is loading the ClawHub detail view for this skill.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function SkillDetailDialog(props: {
  open: boolean;
  skill?: InstalledSkillEntry;
  detail?: InstalledSkillDetail;
  onClose: () => void;
  onUpdate: () => Promise<void>;
  onReinstall: () => Promise<void>;
  onEdit: () => void;
  onRemove: () => void;
  busy: string;
}) {
  if (!props.skill) {
    return null;
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.skill.name}
      description="Inspect the installed skill, its runtime requirements, and the safe actions ChillClaw can perform."
      wide
    >
      <div className="panel-stack">
        <div className="actions-row" style={{ justifyContent: "space-between" }}>
          <div className="actions-row">
            <Badge tone="info">{skillSourceLabel(props.skill)}</Badge>
            <Badge tone={skillReadinessTone(props.skill)}>{props.skill.readiness === "ready" ? "Ready" : "Needs setup"}</Badge>
            {props.skill.version ? <Badge tone="neutral">v{props.skill.version}</Badge> : null}
          </div>
          <div className="actions-row">
            {props.skill.updatable ? (
              <Button variant="outline" onClick={() => void props.onUpdate()} disabled={props.busy === "update"}>
                <RefreshCw size={14} />
                {props.busy === "update" ? "Updating..." : "Update"}
              </Button>
            ) : null}
            {props.skill.updatable ? (
              <Button variant="outline" onClick={() => void props.onReinstall()} disabled={props.busy === "reinstall"}>
                <PackagePlus size={14} />
                {props.busy === "reinstall" ? "Reinstalling..." : "Reinstall"}
              </Button>
            ) : null}
            {props.skill.editable ? (
              <Button variant="outline" onClick={props.onEdit}>
                <Settings2 size={14} />
                Edit
              </Button>
            ) : null}
            {props.skill.removable ? (
              <Button variant="outline" onClick={props.onRemove}>
                <Trash2 size={14} />
                Remove
              </Button>
            ) : null}
          </div>
        </div>

        <Card>
          <CardContent className="panel-stack">
            <strong>Description</strong>
            <p className="card__description">{props.detail?.description || props.skill.description}</p>
            <p className="card__description">{skillMissingSummary(props.skill)}</p>
            {props.skill.homepage ? (
              <a className="card__description" href={props.skill.homepage} rel="noreferrer" target="_blank">
                {props.skill.homepage}
              </a>
            ) : null}
          </CardContent>
        </Card>

        {props.detail?.contentPreview ? (
          <Card>
            <CardContent className="panel-stack">
              <strong>Skill file preview</strong>
              <pre className="card__description" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {props.detail.contentPreview}
              </pre>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Dialog>
  );
}

function RemoveSkillDialog(props: {
  open: boolean;
  skill?: InstalledSkillEntry;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  busy: boolean;
}) {
  if (!props.skill) {
    return null;
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={`Remove ${props.skill.name}?`}
      description={
        props.skill.source === "custom"
          ? "ChillClaw will remove the custom skill folder from the shared OpenClaw skills directory."
          : "ChillClaw will remove the installed ClawHub skill from the shared OpenClaw skills directory."
      }
    >
      <div className="panel-stack">
        <p className="card__description">
          {props.skill.source === "custom"
            ? "This removes the custom skill from ChillClaw and OpenClaw."
            : "This removes the third-party skill package from the shared OpenClaw skills directory."}
        </p>
        <div className="actions-row" style={{ justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={props.onClose} disabled={props.busy}>Cancel</Button>
          <Button onClick={() => void props.onConfirm()} disabled={props.busy}>
            {props.busy ? "Removing..." : "Remove Skill"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function EditCustomSkillDialog(props: {
  open: boolean;
  skill?: InstalledSkillEntry;
  onClose: () => void;
  onSaved: (catalog: SkillCatalogOverview) => void;
  reloadSkills: (options?: { fresh?: boolean }) => Promise<SkillCatalogOverview>;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [homepage, setHomepage] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!props.open || !props.skill) {
      return;
    }

    void fetchInstalledSkillDetail(props.skill.id)
      .then((detail) => {
        setName(detail.name);
        setSlug(detail.slug ?? "");
        setDescription(detail.description);
        setInstructions(detail.contentPreview ?? "");
        setHomepage(detail.homepage ?? "");
        setError(undefined);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "ChillClaw could not load this custom skill.");
      });
  }, [props.open, props.skill]);

  if (!props.skill) {
    return null;
  }

  const skill = props.skill;

  async function handleSave() {
    setBusy(true);
    setError(undefined);

    try {
      const response = await settleAfterMutation({
        mutate: () =>
          updateSkill(skill.id, {
            action: "edit-custom",
            name,
            description,
            instructions,
            homepage
          }),
        getProvisionalState: (mutation) => mutation.skillConfig,
        applyState: props.onSaved,
        readFresh: () => props.reloadSkills({ fresh: true }),
        isSettled: (state) => {
          const nextSkill = state.installedSkills.find((item) => item.id === skill.id);
          return Boolean(nextSkill && nextSkill.name === name && nextSkill.description === description);
        },
        attempts: 8,
        delayMs: 700
      });
      props.onSaved(response.state);
      props.onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "ChillClaw could not save this custom skill.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Edit Custom Skill"
      description="Update the ChillClaw-managed custom skill that lives in the shared OpenClaw skills directory."
      wide
    >
      <div className="panel-stack">
        {error ? <p className="card__description" style={{ color: "var(--danger)" }}>{error}</p> : null}
        <div className="field-grid">
          <div>
            <FieldLabel htmlFor="custom-skill-name">Skill name</FieldLabel>
            <Input id="custom-skill-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="custom-skill-slug">Slug</FieldLabel>
            <Input id="custom-skill-slug" value={slug} onChange={(event) => setSlug(event.target.value)} disabled />
          </div>
          <div>
            <FieldLabel htmlFor="custom-skill-homepage">Homepage</FieldLabel>
            <Input id="custom-skill-homepage" value={homepage} onChange={(event) => setHomepage(event.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="custom-skill-description">Description</FieldLabel>
            <Textarea id="custom-skill-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </div>
          <div>
            <FieldLabel htmlFor="custom-skill-instructions">Instructions</FieldLabel>
            <Textarea id="custom-skill-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={10} />
          </div>
        </div>
        <div className="actions-row" style={{ justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={props.onClose}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={busy || !name.trim() || !description.trim() || !instructions.trim()}>
            {busy ? "Saving..." : "Save Custom Skill"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function AddSkillDialog(props: {
  open: boolean;
  overview?: SkillCatalogOverview;
  onClose: () => void;
  onSaved: (catalog: SkillCatalogOverview) => void;
  reloadSkills: (options?: { fresh?: boolean }) => Promise<SkillCatalogOverview>;
}) {
  const [tab, setTab] = useState("search");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SkillMarketplaceEntry[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [selectedDetail, setSelectedDetail] = useState<SkillMarketplaceDetail>();
  const [searchBusy, setSearchBusy] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [customBusy, setCustomBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [customName, setCustomName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [customHomepage, setCustomHomepage] = useState("");

  useEffect(() => {
    if (!props.open) {
      return;
    }

    setResults(props.overview?.marketplacePreview ?? []);
    setSelectedSlug(undefined);
    setSelectedDetail(undefined);
    setSearch("");
    setError(undefined);
    setTab("search");
    setCustomName("");
    setCustomSlug("");
    setCustomDescription("");
    setCustomInstructions("");
    setCustomHomepage("");
  }, [props.open, props.overview?.marketplacePreview]);

  useEffect(() => {
    if (!props.open || !selectedSlug) {
      return;
    }

    void fetchMarketplaceSkillDetail(selectedSlug)
      .then((detail) => {
        setSelectedDetail(detail);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "ChillClaw could not inspect this marketplace skill.");
      });
  }, [props.open, selectedSlug]);

  async function handleSearch() {
    setSearchBusy(true);
    setError(undefined);

    try {
      const next = await searchMarketplaceSkills(search);
      setResults(next);
      setSelectedSlug(next[0]?.slug);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "ChillClaw could not search ClawHub.");
    } finally {
      setSearchBusy(false);
    }
  }

  async function handleInstall(slug: string) {
    setInstallBusy(true);
    setError(undefined);

    try {
      const response = await settleAfterMutation({
        mutate: () => installMarketplaceSkill({ slug }),
        getProvisionalState: (mutation) => mutation.skillConfig,
        applyState: props.onSaved,
        readFresh: () => props.reloadSkills({ fresh: true }),
        isSettled: (state) => state.installedSkills.some((skill) => skill.slug === slug),
        attempts: 8,
        delayMs: 700
      });
      props.onSaved(response.state);
      props.onClose();
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : "ChillClaw could not install this skill.");
    } finally {
      setInstallBusy(false);
    }
  }

  async function handleCreateCustom() {
    setCustomBusy(true);
    setError(undefined);

    try {
      const expectedSlug = customSlug.trim();
      const expectedName = customName.trim();
      const response = await settleAfterMutation({
        mutate: () =>
          createCustomSkill({
            name: customName,
            slug: customSlug,
            description: customDescription,
            instructions: customInstructions,
            homepage: customHomepage
          }),
        getProvisionalState: (mutation) => mutation.skillConfig,
        applyState: props.onSaved,
        readFresh: () => props.reloadSkills({ fresh: true }),
        isSettled: (state, mutation) => {
          const previousIds = new Set((props.overview?.installedSkills ?? []).map((skill) => skill.id));
          const createdSkill =
            mutation.skillConfig.installedSkills.find((skill) => !previousIds.has(skill.id)) ??
            mutation.skillConfig.installedSkills.find((skill) => (expectedSlug ? skill.slug === expectedSlug : skill.name === expectedName));

          if (!createdSkill) {
            return false;
          }

          const actualSkill = state.installedSkills.find((skill) => skill.id === createdSkill.id);
          return skillEntrySignature(actualSkill) === skillEntrySignature(createdSkill);
        },
        attempts: 8,
        delayMs: 700
      });
      props.onSaved(response.state);
      props.onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "ChillClaw could not create this custom skill.");
    } finally {
      setCustomBusy(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Add Skill"
      description="Search the latest ClawHub skills or create a ChillClaw-managed custom skill in the shared OpenClaw skills directory."
      wide
    >
      <div className="panel-stack">
        {error ? <p className="card__description" style={{ color: "var(--danger)" }}>{error}</p> : null}
        <Tabs defaultValue="search" value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="search">Search Online</TabsTrigger>
            <TabsTrigger value="custom">Create Custom</TabsTrigger>
          </TabsList>
          <TabsContent value="search" className="panel-stack">
            <div className="actions-row">
              <label className="language-selector" style={{ minWidth: 320 }}>
                <Search size={16} />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ClawHub..." />
              </label>
              <Button variant="outline" onClick={() => void handleSearch()} disabled={searchBusy || !search.trim()}>
                <Search size={14} />
                {searchBusy ? "Searching..." : "Search"}
              </Button>
            </div>
            {!props.overview?.marketplaceAvailable ? (
              <p className="card__description">{props.overview?.marketplaceSummary ?? "ClawHub is not available."}</p>
            ) : (
              <div className="split-layout">
                <div className="skill-grid">
                  {results.map((entry) => (
                    <div className="skill-card" key={entry.slug}>
                      <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                        <div className="provider-details">
                          <strong>{entry.name}</strong>
                          <span className="card__description">{entry.summary}</span>
                        </div>
                        <Badge tone={entry.curated ? "success" : "neutral"}>
                          {entry.curated ? "Recommended" : "Review"}
                        </Badge>
                      </div>
                      <div className="actions-row" style={{ marginTop: 12, justifyContent: "space-between" }}>
                        <div className="actions-row">
                          {entry.latestVersion ? <Badge tone="neutral">v{entry.latestVersion}</Badge> : null}
                          {entry.installed ? <Badge tone="info">Installed</Badge> : null}
                        </div>
                        <Button variant="outline" onClick={() => setSelectedSlug(entry.slug)}>
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Card>
                  <CardContent className="panel-stack">
                    {selectedDetail ? (
                      <>
                        <div className="actions-row" style={{ justifyContent: "space-between" }}>
                          <div className="panel-stack" style={{ gap: 4 }}>
                            <strong>{selectedDetail.name}</strong>
                            <span className="card__description">{selectedDetail.summary}</span>
                          </div>
                          <Badge tone={selectedDetail.curated ? "success" : "warning"}>
                            {selectedDetail.curated ? "Curated-first" : "Review carefully"}
                          </Badge>
                        </div>
                        <div className="actions-row">
                          {selectedDetail.latestVersion ? <Badge tone="neutral">v{selectedDetail.latestVersion}</Badge> : null}
                          {selectedDetail.ownerHandle ? <Badge tone="neutral">@{selectedDetail.ownerHandle}</Badge> : null}
                          {typeof selectedDetail.downloads === "number" ? <Badge tone="neutral">{selectedDetail.downloads} downloads</Badge> : null}
                          {typeof selectedDetail.stars === "number" ? <Badge tone="neutral">{selectedDetail.stars} stars</Badge> : null}
                        </div>
                        {selectedDetail.changelog ? <p className="card__description">{selectedDetail.changelog}</p> : null}
                        {selectedDetail.filePreview ? (
                          <pre className="card__description" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                            {selectedDetail.filePreview.slice(0, 1600)}
                          </pre>
                        ) : null}
                        <p className="card__description">
                          ChillClaw installs third-party skills into the shared OpenClaw skills directory. Review the owner, changelog, and preview before you install.
                        </p>
                        <div className="actions-row" style={{ justifyContent: "flex-end" }}>
                          <Button onClick={() => void handleInstall(selectedDetail.slug)} disabled={installBusy || selectedDetail.installed}>
                            <PackagePlus size={14} />
                            {selectedDetail.installed ? "Already Installed" : installBusy ? "Installing..." : "Install Skill"}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="card__description">Select a marketplace skill to inspect it before installing.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
          <TabsContent value="custom" className="panel-stack">
            <div className="field-grid">
              <div>
                <FieldLabel htmlFor="new-custom-name">Skill name</FieldLabel>
                <Input id="new-custom-name" value={customName} onChange={(event) => setCustomName(event.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="new-custom-slug">Slug</FieldLabel>
                <Input id="new-custom-slug" value={customSlug} onChange={(event) => setCustomSlug(event.target.value)} placeholder="optional-slug" />
              </div>
              <div>
                <FieldLabel htmlFor="new-custom-homepage">Homepage</FieldLabel>
                <Input id="new-custom-homepage" value={customHomepage} onChange={(event) => setCustomHomepage(event.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="new-custom-description">Description</FieldLabel>
                <Textarea id="new-custom-description" value={customDescription} onChange={(event) => setCustomDescription(event.target.value)} rows={3} />
              </div>
              <div>
                <FieldLabel htmlFor="new-custom-instructions">Instructions</FieldLabel>
                <Textarea id="new-custom-instructions" value={customInstructions} onChange={(event) => setCustomInstructions(event.target.value)} rows={10} />
              </div>
            </div>
            <div className="actions-row" style={{ justifyContent: "flex-end" }}>
              <Button onClick={() => void handleCreateCustom()} disabled={customBusy || !customName.trim() || !customDescription.trim() || !customInstructions.trim()}>
                <Sparkles size={14} />
                {customBusy ? "Creating..." : "Create Custom Skill"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Dialog>
  );
}

export default function SkillsPage() {
  const { locale } = useLocale();
  const copy = t(locale).skills;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [overview, setOverview] = useState<SkillCatalogOverview>();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailSkill, setDetailSkill] = useState<InstalledSkillEntry>();
  const [detailData, setDetailData] = useState<InstalledSkillDetail>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [removeSkillEntry, setRemoveSkillEntry] = useState<InstalledSkillEntry>();
  const [editSkillEntry, setEditSkillEntry] = useState<InstalledSkillEntry>();
  const [marketplaceResults, setMarketplaceResults] = useState<SkillMarketplaceEntry[]>([]);
  const [marketplaceBusy, setMarketplaceBusy] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState<string>();
  const [marketplaceDetailSlug, setMarketplaceDetailSlug] = useState<string>();

  async function reloadSkills(options?: { fresh?: boolean }) {
    setLoading(true);
    setError(undefined);

    try {
      const next = await fetchSkillConfig(options);
      setOverview(next);
      return next;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "ChillClaw could not load skills.");
      return undefined;
    } finally {
      setLoading(false);
    }
  }

  async function reloadSkillsStrict(options?: { fresh?: boolean }) {
    const next = await reloadSkills(options);

    if (!next) {
      throw new Error("ChillClaw could not verify the latest skill catalog.");
    }

    return next;
  }

  useEffect(() => {
    void reloadSkills();
  }, []);

  useEffect(() => {
    if (!detailOpen || !detailSkill) {
      return;
    }

    void fetchInstalledSkillDetail(detailSkill.id)
      .then(setDetailData)
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "ChillClaw could not load this skill.");
      });
  }, [detailOpen, detailSkill]);

  useEffect(() => {
    if (!overview?.marketplaceAvailable || !search.trim()) {
      setMarketplaceResults([]);
      setMarketplaceBusy(false);
      setMarketplaceError(undefined);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMarketplaceBusy(true);
      setMarketplaceError(undefined);

      void searchMarketplaceSkills(search.trim())
        .then((results) => {
          setMarketplaceResults(filterMarketplaceSearchResults(results));
        })
        .catch((searchError) => {
          setMarketplaceError(searchError instanceof Error ? searchError.message : "ChillClaw could not search ClawHub.");
        })
        .finally(() => {
          setMarketplaceBusy(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [overview?.marketplaceAvailable, search]);

  const filtered = useMemo(
    () =>
      overview?.installedSkills.filter(
        (skill) =>
          skill.name.toLowerCase().includes(search.toLowerCase()) ||
          skill.description.toLowerCase().includes(search.toLowerCase())
      ) ?? [],
    [overview?.installedSkills, search]
  );

  const readyCount = overview?.installedSkills.filter((skill) => skill.readiness === "ready").length ?? 0;
  const customCount = overview?.installedSkills.filter((skill) => skill.source === "custom").length ?? 0;
  const marketplaceCount = overview?.installedSkills.filter((skill) => skill.source === "clawhub").length ?? 0;
  const trimmedSearch = search.trim();
  const showMarketplaceSearch = Boolean(trimmedSearch && overview?.marketplaceAvailable);
  const showInstalledEmpty = Boolean(overview?.installedSkills.length && trimmedSearch && filtered.length === 0);

  if (loading && !overview) {
    return (
      <WorkspaceScaffold title={copy.title} subtitle={copy.subtitle}>
        <Card className="skills-loading-card">
          <CardContent className="skills-loading-card__content">
            <Loader2 className="skills-loading-card__spinner" size={24} />
            <div className="skills-loading-card__meta">
              <strong>{copy.loadingTitle}</strong>
              <p className="card__description">{copy.loadingBody}</p>
            </div>
          </CardContent>
        </Card>
      </WorkspaceScaffold>
    );
  }

  if (error && !overview) {
    return (
      <EmptyState
        title="ChillClaw could not load skills"
        description={error}
        actionLabel="Retry"
        onAction={() => void reloadSkills({ fresh: true })}
      />
    );
  }

  return (
    <WorkspaceScaffold
      title={copy.title}
      subtitle={copy.subtitle}
      actions={
        <div className="actions-row">
          <Button variant="outline" onClick={() => void reloadSkills({ fresh: true })} disabled={loading}>
            {loading ? <Loader2 className="skills-inline-spinner" size={14} /> : <RefreshCw size={14} />}
            {loading ? copy.refreshing : copy.refresh}
          </Button>
          <Button onClick={() => setAddDialogOpen(true)}>
            <PackagePlus size={14} />
            {copy.addSkill}
          </Button>
        </div>
      }
    >

      <div className="grid--four">
        <MetricCard label={copy.total} value={overview?.installedSkills.length ?? 0} />
        <MetricCard label={copy.ready} value={readyCount} />
        <MetricCard label={copy.marketplace} value={marketplaceCount} />
        <MetricCard label={copy.custom} value={customCount} />
      </div>

      <Card>
        <CardContent className="actions-row" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>{copy.infoTitle}</strong>
            <p className="card__description">{copy.infoBody}</p>
            <p className="card__description">{overview?.readiness.summary}</p>
          </div>
          <Badge tone={overview?.marketplaceAvailable ? "success" : "warning"}>
            {overview?.marketplaceAvailable ? "ClawHub available" : "ClawHub unavailable"}
          </Badge>
        </CardContent>
      </Card>

      {loading ? (
        <Card className="skills-loading-card skills-loading-card--inline">
          <CardContent className="skills-loading-card__content">
            <Loader2 className="skills-loading-card__spinner" size={20} />
            <div className="skills-loading-card__meta">
              <strong>{copy.loadingTitle}</strong>
              <p className="card__description">{copy.loadingBody}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="skills-search-row">
        <label className="skills-search-field">
          <Search size={16} />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchPlaceholder} />
        </label>
      </div>

      {overview?.installedSkills.length ? (
        <>
          {trimmedSearch ? (
            <div className="panel-stack" style={{ gap: 8 }}>
              <strong>{copy.installedMatchesTitle}</strong>
              <p className="card__description">{copy.installedMatchesBody}</p>
            </div>
          ) : null}
          {filtered.length > 0 ? (
            <div className="skill-grid">
              {filtered.map((skill) => (
                <div className="skill-card" key={skill.id}>
                  <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                    <div className="provider-details">
                      <strong>{skill.name}</strong>
                      <span className="card__description">{skill.description}</span>
                    </div>
                    <div className="actions-row">
                      <Badge tone="neutral">{skillSourceLabel(skill)}</Badge>
                      <Badge tone={skillReadinessTone(skill)}>{skill.readiness === "ready" ? "Ready" : "Needs setup"}</Badge>
                    </div>
                  </div>
                  <p className="card__description" style={{ marginTop: 12 }}>{skillMissingSummary(skill)}</p>
                  <div className="actions-row" style={{ marginTop: 16, justifyContent: "space-between" }}>
                    <div className="actions-row">
                      {skill.version ? <Badge tone="neutral">v{skill.version}</Badge> : null}
                      {skill.homepage ? (
                        <a className="card__description" href={skill.homepage} rel="noreferrer" target="_blank">
                          <Globe size={14} style={{ marginRight: 4 }} />
                          Docs
                        </a>
                      ) : null}
                    </div>
                    <div className="actions-row">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDetailSkill(skill);
                          setDetailData(undefined);
                          setDetailOpen(true);
                        }}
                      >
                        View Details
                      </Button>
                      {skill.updatable ? (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setBusy(`update:${skill.id}`);
                            void updateSkill(skill.id, { action: "update" })
                              .then((response) => setOverview(response.skillConfig))
                              .catch((updateError) => setError(updateError instanceof Error ? updateError.message : "ChillClaw could not update this skill."))
                              .finally(() => setBusy(""));
                          }}
                          disabled={busy === `update:${skill.id}`}
                        >
                          <RefreshCw size={14} />
                          {busy === `update:${skill.id}` ? "Updating..." : "Update"}
                        </Button>
                      ) : null}
                      {skill.editable ? (
                        <Button variant="outline" onClick={() => setEditSkillEntry(skill)}>
                          <Settings2 size={14} />
                          Edit
                        </Button>
                      ) : null}
                      {skill.removable ? (
                        <Button variant="outline" onClick={() => setRemoveSkillEntry(skill)}>
                          <Trash2 size={14} />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : showInstalledEmpty ? (
            <Card>
              <CardContent className="panel-stack">
                <strong>{copy.noInstalledMatchesTitle}</strong>
                <p className="card__description">{copy.noInstalledMatchesBody}</p>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : !trimmedSearch ? (
        <EmptyState
          title="No installed skills yet"
          description="Add a ClawHub skill or create a custom skill to start building a shared skill library."
          actionLabel={copy.addSkill}
          onAction={() => setAddDialogOpen(true)}
        />
      ) : null}

      {showMarketplaceSearch ? (
        <div className="panel-stack">
          <div className="panel-stack" style={{ gap: 8 }}>
            <strong>{copy.onlineMatchesTitle}</strong>
            <p className="card__description">{copy.onlineMatchesBody}</p>
          </div>

          {marketplaceBusy ? (
            <Card className="skills-loading-card skills-loading-card--inline">
              <CardContent className="skills-loading-card__content">
                <Loader2 className="skills-loading-card__spinner" size={20} />
                <div className="skills-loading-card__meta">
                  <strong>{copy.marketplaceSearchingTitle}</strong>
                  <p className="card__description">{copy.marketplaceSearchingBody}</p>
                </div>
              </CardContent>
            </Card>
          ) : marketplaceError ? (
            <Card>
              <CardContent className="panel-stack">
                <strong>{copy.onlineSearchErrorTitle}</strong>
                <p className="card__description">{marketplaceError}</p>
              </CardContent>
            </Card>
          ) : marketplaceResults.length > 0 ? (
            <div className="skill-grid">
              {marketplaceResults.map((entry) => (
                <div className="skill-card" key={entry.slug}>
                  <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                    <div className="provider-details">
                      <strong>{entry.name}</strong>
                      <span className="card__description">{entry.summary}</span>
                    </div>
                    <Badge tone={entry.curated ? "success" : "neutral"}>
                      {entry.curated ? "Recommended" : "Review"}
                    </Badge>
                  </div>
                  <div className="actions-row" style={{ marginTop: 16, justifyContent: "space-between" }}>
                    <div className="actions-row">
                      <Badge tone="neutral">ClawHub</Badge>
                      {entry.latestVersion ? <Badge tone="neutral">v{entry.latestVersion}</Badge> : null}
                    </div>
                    <div className="actions-row">
                      <Button variant="outline" onClick={() => setMarketplaceDetailSlug(entry.slug)}>
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="panel-stack">
                <strong>{copy.noOnlineMatchesTitle}</strong>
                <p className="card__description">{copy.noOnlineMatchesBody}</p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      <AddSkillDialog
        open={addDialogOpen}
        overview={overview}
        onClose={() => setAddDialogOpen(false)}
        onSaved={setOverview}
        reloadSkills={reloadSkillsStrict}
      />
      <EditCustomSkillDialog
        open={Boolean(editSkillEntry)}
        skill={editSkillEntry}
        onClose={() => setEditSkillEntry(undefined)}
        onSaved={setOverview}
        reloadSkills={reloadSkillsStrict}
      />
      <MarketplaceSkillDialog
        open={Boolean(marketplaceDetailSlug)}
        slug={marketplaceDetailSlug}
        onClose={() => setMarketplaceDetailSlug(undefined)}
        onInstalled={setOverview}
        reloadSkills={reloadSkillsStrict}
      />
      <SkillDetailDialog
        open={detailOpen}
        skill={detailSkill}
        detail={detailData}
        onClose={() => setDetailOpen(false)}
        onUpdate={async () => {
          if (!detailSkill) {
            return;
          }

          setBusy("update");
          try {
            const response = await settleAfterMutation({
              mutate: () => updateSkill(detailSkill.id, { action: "update" }),
              getProvisionalState: (mutation) => mutation.skillConfig,
              applyState: setOverview,
              readFresh: () => reloadSkillsStrict({ fresh: true }),
              isSettled: (state, mutation) => {
                const expectedSkill = mutation.skillConfig.installedSkills.find((skill) => skill.id === detailSkill.id);
                const actualSkill = state.installedSkills.find((skill) => skill.id === detailSkill.id);
                return skillEntrySignature(actualSkill) === skillEntrySignature(expectedSkill);
              },
              attempts: 8,
              delayMs: 700
            });
            setOverview(response.state);
            setDetailData(await fetchInstalledSkillDetail(detailSkill.id));
          } finally {
            setBusy("");
          }
        }}
        onReinstall={async () => {
          if (!detailSkill) {
            return;
          }

          setBusy("reinstall");
          try {
            const response = await settleAfterMutation({
              mutate: () => updateSkill(detailSkill.id, { action: "reinstall" }),
              getProvisionalState: (mutation) => mutation.skillConfig,
              applyState: setOverview,
              readFresh: () => reloadSkillsStrict({ fresh: true }),
              isSettled: (state, mutation) => {
                const expectedSkill = mutation.skillConfig.installedSkills.find((skill) => skill.id === detailSkill.id);
                const actualSkill = state.installedSkills.find((skill) => skill.id === detailSkill.id);
                return skillEntrySignature(actualSkill) === skillEntrySignature(expectedSkill);
              },
              attempts: 8,
              delayMs: 700
            });
            setOverview(response.state);
            setDetailData(await fetchInstalledSkillDetail(detailSkill.id));
          } finally {
            setBusy("");
          }
        }}
        onEdit={() => {
          setDetailOpen(false);
          setEditSkillEntry(detailSkill);
        }}
        onRemove={() => {
          setDetailOpen(false);
          setRemoveSkillEntry(detailSkill);
        }}
        busy={busy}
      />
      <RemoveSkillDialog
        open={Boolean(removeSkillEntry)}
        skill={removeSkillEntry}
        onClose={() => setRemoveSkillEntry(undefined)}
        onConfirm={async () => {
          if (!removeSkillEntry) {
            return;
          }

          setBusy("remove");
          try {
            const response = await settleAfterMutation({
              mutate: () => removeSkill(removeSkillEntry.id),
              getProvisionalState: (mutation) => mutation.skillConfig,
              applyState: setOverview,
              readFresh: () => reloadSkillsStrict({ fresh: true }),
              isSettled: (state) => !state.installedSkills.some((skill) => skill.id === removeSkillEntry.id),
              attempts: 8,
              delayMs: 700
            });
            setOverview(response.state);
            setRemoveSkillEntry(undefined);
          } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : "ChillClaw could not remove this skill.");
          } finally {
            setBusy("");
          }
        }}
        busy={busy === "remove"}
      />
    </WorkspaceScaffold>
  );
}
