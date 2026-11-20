import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { LayoutTemplate } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { errorMessage, previewUrl } from "@/client/lib/preview";
import {
  copyProject,
  getTemplates,
  setTemplate,
} from "@/serverFunctions/projects";

export const Route = createFileRoute("/templates")({
  loader: () => getTemplates(),
  head: () => ({ meta: [{ title: "Templates · Calligraphy Studio" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const templates = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  async function use(id: string) {
    setBusy(`use:${id}`);
    try {
      const copy = await copyProject({ data: { id } });
      await navigate({ to: "/projects/$projectId", params: { projectId: copy.id } });
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(null);
    }
  }

  async function unpublish(id: string) {
    setBusy(`unpublish:${id}`);
    try {
      await setTemplate({ data: { id, published: false } });
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Templates"
        description="Using a template gives you your own copy to edit."
      />
      {templates.length === 0 ? (
        <div data-testid="templates-empty">
          <EmptyState
            icon={LayoutTemplate}
            title="No templates yet"
            description="Publish a project from its editor and it will appear here."
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <li key={template.id}>
              <Card data-testid="template-card" className="overflow-hidden p-0">
                <div className="aspect-square border-b border-border bg-muted">
                  {template.preview ? (
                    <img
                      src={previewUrl(template.preview)}
                      alt=""
                      className="size-full object-contain"
                    />
                  ) : null}
                </div>
                <div className="space-y-3 p-4">
                  <div className="space-y-1">
                    <p className="truncate font-medium">{template.title}</p>
                    {template.ownerEmail ? (
                      <p className="truncate text-sm text-muted-foreground">
                        By {template.ownerEmail}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      data-testid="template-use"
                      pending={busy === `use:${template.id}`}
                      disabled={busy !== null}
                      onClick={() => use(template.id)}
                    >
                      Use template
                    </Button>
                    {template.canUnpublish ? (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="template-unpublish"
                        pending={busy === `unpublish:${template.id}`}
                        disabled={busy !== null}
                        onClick={() => unpublish(template.id)}
                      >
                        Unpublish
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
