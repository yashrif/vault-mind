import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import React, { ReactNode } from "react";

interface ToolActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  accent?: boolean;
  danger?: boolean;
  children?: ReactNode;
}

const ToolActionButton = ({
  className,
  accent,
  danger,
  children,
  ...props
}: ToolActionButtonProps) => (
  <Button
    type="button"
    variant="ghost2"
    size="sm"
    className={cn(
      "tw-h-8 tw-text-xs tw-font-medium tw-text-muted tw-transition-colors hover:tw-text-normal",
      accent ? "hover:tw-text-accent" : "",
      danger ? "hover:tw-text-error" : "",
      className
    )}
    {...props}
  >
    {children}
  </Button>
);

export default ToolActionButton;
