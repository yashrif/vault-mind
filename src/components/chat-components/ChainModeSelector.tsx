import {
  deriveChainPresetId,
  type Mode,
  type ProjectConfig,
  type RetrievalPolicy,
  type Scope,
  setCurrentProject,
  useMode,
  useRetrievalPolicy,
  useScope,
} from "@/aiParams";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectScopePopover } from "@/components/chat-components/ProjectScopePopover";
import { cn } from "@/lib/utils";
import type { ChainPresetId } from "@/runtime/ChainPreset";
import { Bot, ChevronDown, Database, MessageCircle } from "lucide-react";
import React from "react";

interface ChainModeSelectorProps {
  onSelectChain: (presetId: ChainPresetId) => void | Promise<void>;
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
 * project-scope popover for Agent mode. Each change derives the internal
 * preset ID and reports it via onSelectChain so the parent's transition
 * handler (autosave on leaving Project, etc.) still runs.
 */
export function ChainModeSelector({
  onSelectChain,
  className,
  align = "start",
}: ChainModeSelectorProps) {
  const [mode, setMode] = useMode();
  const [scope, setScope] = useScope();
  const [retrieval, setRetrieval] = useRetrievalPolicy();

  const trigger = (nextMode: Mode, nextScope: Scope, nextRetrieval: RetrievalPolicy) => {
    void onSelectChain(deriveChainPresetId(nextMode, nextScope, nextRetrieval));
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
        <ProjectScopePopover
          isProject={scope === "project"}
          onSelectAll={() => {
            setCurrentProject(null);
            handleScopeChange("global");
          }}
          onSelectProject={(project: ProjectConfig) => {
            setCurrentProject(project);
            handleScopeChange("project");
          }}
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
