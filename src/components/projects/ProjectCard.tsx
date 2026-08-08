import Link from "next/link";
import { duplicateProject } from "@/lib/projects/actions";
import { Button } from "@/components/ui/Button";
import {
  DeleteProjectForm,
  RenameProjectForm,
} from "@/components/projects/ProjectManageForms";

export type ProjectListItem = {
  id: string;
  name: string;
  floorCount: number;
  areaLabel: string;
  updatedLabel: string;
};

type ProjectCardProps = {
  project: ProjectListItem;
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-elevated p-5 shadow-card">
      <div className="flex flex-col gap-1">
        <Link
          href={`/editor/${project.id}`}
          className="text-lg font-semibold tracking-tight text-navy hover:text-accent"
        >
          {project.name}
        </Link>
        <p className="text-sm text-fg-muted">
          {project.floorCount} {project.floorCount === 1 ? "floor" : "floors"}
          {" · "}
          {project.areaLabel}
          {" · "}
          Updated {project.updatedLabel}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <Link
          href={`/editor/${project.id}`}
          className="inline-flex min-h-[var(--sp-touch-min)] items-center justify-center rounded-sm bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover"
        >
          Open
        </Link>
        <form action={duplicateProject}>
          <input type="hidden" name="projectId" value={project.id} />
          <Button type="submit" variant="secondary">
            Duplicate
          </Button>
        </form>
        <RenameProjectForm projectId={project.id} name={project.name} />
        <DeleteProjectForm projectId={project.id} name={project.name} />
      </div>
    </article>
  );
}
