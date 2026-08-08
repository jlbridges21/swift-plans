"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  publishProject,
  unpublishProject,
} from "@/lib/projects/publish-actions";

type PublishControlsProps = {
  projectId: string;
  initialStatus: "draft" | "published";
  publicSlug: string;
  compact?: boolean;
};

export function PublishControls({
  projectId,
  initialStatus,
  publicSlug,
  compact = false,
}: PublishControlsProps) {
  const [status, setStatus] = useState(initialStatus);
  const [slug, setSlug] = useState(publicSlug);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/p/${slug}`
      : `/p/${slug}`;

  async function toggle() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result =
        status === "published"
          ? await unpublishProject(projectId)
          : await publishProject(projectId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatus(result.publishStatus);
      setSlug(result.publicSlug);
      setMessage(
        result.publishStatus === "published"
          ? "Published — anyone with the link can view."
          : "Unpublished — the public link no longer works.",
      );
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    setError(null);
    try {
      const url = `${window.location.origin}/p/${slug}`;
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      setError("Could not copy the link. Select and copy it manually.");
    }
  }

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={status === "published" ? "secondary" : "primary"}
          disabled={busy}
          onClick={() => void toggle()}
        >
          {busy
            ? "Working…"
            : status === "published"
              ? "Unpublish"
              : "Publish"}
        </Button>
        {status === "published" ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void copyLink()}
          >
            Copy link
          </Button>
        ) : null}
        {!compact && status === "published" ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:underline"
          >
            Open public page
          </a>
        ) : null}
      </div>
      {status === "published" && !compact ? (
        <p className="break-all text-xs text-fg-muted">{publicUrl}</p>
      ) : null}
      {status === "published" && compact ? (
        <p className="text-xs font-medium text-accent">Published</p>
      ) : null}
      {message ? <p className="text-xs text-fg-muted">{message}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
