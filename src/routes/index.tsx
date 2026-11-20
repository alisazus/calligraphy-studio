import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Feather, Plus } from "lucide-react";
import { useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { ProjectTitleDialog } from "@/client/components/ProjectTitleDialog";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { previewUrl } from "@/client/lib/preview";
import { createProject, getProjects } from "@/serverFunctions/projects";

export const Route = createFileRoute("/")({
  loader: () => getProjects(),
  head: () => ({ meta: [{ title: "Projects · Calligraphy Studio" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const projects = Route.useLoaderData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const newButton = (
    <Button data-testid="new-project" onClick={() => setCreating(true)}>
      <Plus data-icon="inline-start" aria-hidden />
      New project
    </Button>
  );

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Projects" actions={projects.length ? newButton : null} />
      {projects.length === 0 ? (
        <div data-testid="projects-empty">
          <EmptyState
            icon={Feather}
            title="No projects yet"
            description="Create one to start writing."
            action={newButton}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Card
                data-testid="project-card"
                className="overflow-hidden p-0 transition-shadow hover:shadow-md"
              >
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  className="block"
                >
                  <div className="aspect-square border-b border-border bg-muted">
                    {project.preview ? (
                      <img
                        src={previewUrl(project.preview)}
                        alt=""
                        className="size-full object-contain"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <Feather className="size-8" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{project.title}</span>
                      {project.access === "viewer" || project.access === "editor" ? (
                        <Badge variant="secondary" data-testid="project-role">
                          {project.access === "editor" ? "Editor" : "Viewer"}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {project.ownerEmail
                        ? `Shared by ${project.ownerEmail}`
                        : `Edited ${formatDate(project.updatedAt)}`}
                    </p>
                  </div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <ProjectTitleDialog
          title="New project"
          submitLabel="Create"
          onClose={() => setCreating(false)}
          onSubmit={async (title) => {
            const { id } = await createProject({ data: { title } });
            await navigate({ to: "/projects/$projectId", params: { projectId: id } });
          }}
        />
      ) : null}
    </AppShell>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
