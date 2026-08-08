"use client";

import { useState } from "react";
import { PublicPlanViewer } from "@/components/public/PublicPlanViewer";
import type { PublishedPlan } from "@/lib/projects/published";

type PublicPlanClientProps = {
  plan: PublishedPlan;
};

export function PublicPlanClient({ plan }: PublicPlanClientProps) {
  const [activeFloorId, setActiveFloorId] = useState(plan.floors[0]!.id);
  const floor =
    plan.floors.find((f) => f.id === activeFloorId) ?? plan.floors[0]!;

  return (
    <PublicPlanViewer
      projectName={plan.projectName}
      geometry={floor.geometry}
      style={plan.style}
      floors={plan.floors.map((f) => ({ id: f.id, name: f.name }))}
      activeFloorId={floor.id}
      onFloorChange={setActiveFloorId}
    />
  );
}
