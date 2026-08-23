import { useState } from "react";
import { InfoIcon } from "../icons";

interface PluginHelpPopoverProps {
  title: string;
  children: string;
}

export function PluginHelpPopover({ title, children }: PluginHelpPopoverProps) {
  const [open, setOpen] = useState(false);
  return <span className="plugin-help">
    <button type="button" className="icon-button plugin-help-trigger" onClick={() => setOpen((value) => !value)} aria-label={`${title} erklären`} aria-expanded={open}>
      <InfoIcon className="h-4 w-4" />
    </button>
    {open ? <span className="plugin-help-popover" role="status"><strong>{title}</strong><span>{children}</span></span> : null}
  </span>;
}
