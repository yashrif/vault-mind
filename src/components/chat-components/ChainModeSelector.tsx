import {
  deriveChainType,
  type Mode,
  type ProjectConfig,
  type RetrievalPolicy,
  type Scope,
  setCurrentProject,
  useCurrentProject,
  useMode,
  useRetrievalPolicy,
  useScope,
} from "@/aiParams";
import { ChainType } from "@/chainFactory";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSettingsValue } from "@/settings/model";
import { Bot, ChevronDown, Database, Folder, Globe, MessageCircle } from "lucide-react";
import React from "react";

interface ChainModeSelectorProps {
  selectedChain: ChainType;
  onSelectChain: (chainType: ChainType) => void | Promise<void>;
  onProjectSelect?: (project: ProjectConfig) => void;
  onProjectDeselect?: () => void;
  className?: string;
  align?: "start" | "center" | "end";
}

interface ModeOption {
  mode: Mode;
  label: string;
  icon: React.ReactNode;
}

const MODE_OPTIONS: ModeOption[] = [
  { mode: "chat", label: "Chat", icon: <MessageCircle className="tw-size-4" /> },
  { mode: "agent", label: "Agent", icon: <Bot className="tw-size-4" /> },
];

/**
 * Chat-header mode controls. Renders the Chat/Agent mode switch plus a
 * conditional secondary control: a retrieval toggle for Chat mode and a
 * project-scope chip for Agent mode. Each change derives the internal
 * ChainType and reports it via onSelectChain so the parent's transition
 * handler (autosave on leaving Project, etc.) still runs.
 */
export function ChainModeSelector({
  onSelectChain,
  onProjectSelect,
  onProjectDeselect,
  className,
  align = "start",
}: ChainModeSelectorProps) {
  const [mode, setMode] = useMode();
  const [scope, setScope] = useScope();
  const [retrieval, setRetrieval] = useRetrievalPolicy();

  const trigger = (nextMode: Mode, nextScope: Scope, nextRetrieval: RetrievalPolicy) => {
    void onSelectChain(deriveChainType(nextMode, nextScope, nextRetrieval));
  };

  const handleModeChange = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    trigger(next, scope, retrieval);
  };

  const handleScopeChange = (next: Scope) => {
    setScope(next);
    trigger(mode, next, retrieval);
  };

  const handleRetrievalChange = (next: RetrievalPolicy) => {
    if (next === retrieval) return;
    setRetrieval(next);
    trigger(mode, scope, next);
  };

  const handleProjectSelect = (project: ProjectConfig) => {
    setCurrentProject(project);
    onProjectSelect?.(project);
  };

  const handleProjectDeselect = () => {
    setCurrentProject(null);
    onProjectDeselect?.();
  };

  const selectedMode = MODE_OPTIONS.find((o) => o.mode === mode) ?? MODE_OPTIONS[0];

  return (
    <div className={cn("tw-flex tw-items-center tw-gap-1", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost2" size="fit" className="tw-text-sm tw-text-muted">
            <div className="tw-flex tw-items-center tw-gap-1">
              {selectedMode.icon}
              {selectedMode.label}
            </div>
            <ChevronDown className="tw-mt-0.5 tw-size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align}>
          {MODE_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.mode}
              className="tw-flex tw-items-center tw-gap-1"
              onSelect={() => handleModeChange(option.mode)}
            >
              {option.icon}
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {mode === "chat" && <RetrievalToggle value={retrieval} onChange={handleRetrievalChange} />}
      {mode === "agent" && (
        <ScopeToggle
          value={scope}
          onChange={handleScopeChange}
          onProjectSelect={handleProjectSelect}
          onProjectDeselect={handleProjectDeselect}
        />
      )}
    </div>
  );
}

interface RetrievalToggleProps {
  value: RetrievalPolicy;
  onChange: (next: RetrievalPolicy) => void;
}

function RetrievalToggle({ value, onChange }: RetrievalToggleProps) {
  const isOn = value === "vault_auto";
  return (
    <Button
      variant="ghost2"
      size="fit"
      className={cn("tw-text-sm", isOn ? "tw-text-accent" : "tw-text-muted")}
      onClick={() => onChange(isOn ? "none" : "vault_auto")}
      title={
        isOn ? "Vault retrieval on — click to turn off" : "Vault retrieval off — click to turn on"
      }
    >
      <Database className="tw-size-4" />
      {isOn ? "Ask vault" : "General"}
    </Button>
  );
}

interface ScopeToggleProps {
  value: Scope;
  onChange: (next: Scope) => void;
  onProjectSelect: (project: ProjectConfig) => void;
  onProjectDeselect: () => void;
}

function ScopeToggle({ value, onChange, onProjectSelect, onProjectDeselect }: ScopeToggleProps) {
  const isProject = value === "project";
  const [currentProject] = useCurrentProject();
  const settings = useSettingsValue();
  const projects = settings.projectList || [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost2"
          size="fit"
          className={cn("tw-text-sm", isProject ? "tw-text-accent" : "tw-text-muted")}
          title={
            isProject
              ? `Project scope: ${currentProject?.name ?? "none"}`
              : "All notes — click to choose scope"
          }
        >
          {isProject ? (
            <>
              <Folder className="tw-size-4" />
              {currentProject?.name ?? "Project"}
            </>
          ) : (
            <>
              <Globe className="tw-size-4" />
              All notes
            </>
          )}
          <ChevronDown className="tw-mt-0.5 tw-size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="tw-w-56">
        <DropdownMenuItem
          className="tw-flex tw-items-center tw-gap-2"
          onSelect={() => {
            if (isProject) {
              onProjectDeselect();
            }
            onChange("global");
          }}
        >
          <Globe className="tw-size-4" />
          All notes
        </DropdownMenuItem>
        {projects.length > 0 && <DropdownMenuSeparator />}
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            className={cn(
              "tw-flex tw-items-center tw-gap-2",
              isProject && currentProject?.id === project.id && "tw-text-accent"
            )}
            onSelect={() => {
              onChange("project");
              onProjectSelect(project);
            }}
          >
            <Folder className="tw-size-4" />
            <span className="tw-truncate">{project.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
