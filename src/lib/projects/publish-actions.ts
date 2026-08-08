"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type PublishResult =
  | {
      ok: true;
      publishStatus: "draft" | "published";
      publicSlug: string;
    }
  | { ok: false; error: string };

export async function setProjectPublishStatus(
  projectId: string,
  status: "draft" | "published",
): Promise<PublishResult> {
  const user = await getUser();
  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Sign in again to publish.",
    };
  }
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .update({ publish_status: status })
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .select("publish_status, public_slug")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      error:
        status === "published"
          ? "Could not publish this plan. Check your connection and try again."
          : "Could not unpublish this plan. Check your connection and try again.",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/editor/${projectId}`);
  revalidatePath(`/p/${data.public_slug}`);

  return {
    ok: true,
    publishStatus: data.publish_status as "draft" | "published",
    publicSlug: data.public_slug as string,
  };
}

export async function publishProject(projectId: string): Promise<PublishResult> {
  return setProjectPublishStatus(projectId, "published");
}

export async function unpublishProject(
  projectId: string,
): Promise<PublishResult> {
  return setProjectPublishStatus(projectId, "draft");
}
