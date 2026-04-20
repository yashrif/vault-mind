import { ChainType } from "@/chainFactory";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Bot, ChevronDown, Database, FolderOpen, MessageCircle, Send } from "lucide-react";
import React from "react";

interface ChainModeSelectorProps {
  selectedChain: ChainType;
  onSelectChain: (chainType: ChainType) => void | Promise<void>;
  className?: string;
  align?: "start" | "center" | "end";
}

interface ChainOption {
  chainType: ChainType;
  label: string;
  icon?: React.ReactNode;
}

const CHAIN_OPTIONS: ChainOption[] = [
  {
    chainType: ChainType.LLM_CHAIN,
    label: "Chat",
    icon: <MessageCircle className="tw-size-4" />,
  },
  {
    chainType: ChainType.VAULT_QA_CHAIN,
    label: "Vault QA",
    icon: <Database className="tw-size-4" />,
  },
  {
    chainType: ChainType.TOOL_CHAIN,
    label: "Agent",
    icon: <Bot className="tw-size-4" />,
  },
  {
    chainType: ChainType.PROJECT_CHAIN,
    label: "Project",
    icon: <FolderOpen className="tw-size-4" />,
  },
  {
    chainType: ChainType.TELEGRAM_CHAIN,
    label: "Telegram",
    icon: <Send className="tw-size-4" />,
  },
];

/**
 * Reusable chain mode dropdown used in top controls and Telegram composer.
 */
export function ChainModeSelector({
  selectedChain,
  onSelectChain,
  className,
  align = "start",
}: ChainModeSelectorProps) {
  const selectedOption = CHAIN_OPTIONS.find((option) => option.chainType === selectedChain);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost2" size="fit" className={cn("tw-text-sm tw-text-muted", className)}>
          {selectedOption?.icon ? (
            <div className="tw-flex tw-items-center tw-gap-1">
              {selectedOption.icon}
              {selectedOption.label}
            </div>
          ) : (
            selectedOption?.label
          )}
          <ChevronDown className="tw-mt-0.5 tw-size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {CHAIN_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.chainType}
            className={cn(option.icon && "tw-flex tw-items-center tw-gap-1")}
            onSelect={() => {
              void onSelectChain(option.chainType);
            }}
          >
            {option.icon}
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
