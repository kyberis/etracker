"use client";

import { Sparkles, XIcon } from "lucide-react";

import { ChatExperience } from "@/components/chat-experience";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ChatFullscreenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefer this month (yyyy-MM) when the user is on a month dashboard. */
  activeMonth?: string;
};

export function ChatFullscreenDialog({
  open,
  onOpenChange,
  activeMonth,
}: ChatFullscreenDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={
          "!fixed !inset-0 !top-0 !left-0 !flex !h-[100dvh] !max-h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 !rounded-none border-0 p-0 data-closed:zoom-out-100 data-open:zoom-in-100 sm:max-w-none"
        }
      >
        <DialogHeader className="bg-background flex shrink-0 flex-row items-center justify-between space-y-0 border-b px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="text-primary size-5 shrink-0" aria-hidden />
            <DialogTitle className="truncate">eTracker Assistant</DialogTitle>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cerrar chat"
            onClick={() => onOpenChange(false)}
          >
            <XIcon className="size-4" />
          </Button>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ChatExperience activeMonth={activeMonth} layout="fullscreen" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
