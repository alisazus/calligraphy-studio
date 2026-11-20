import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ChevronLeft, Copy, MoreHorizontal, Redo2, Share2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { ProjectTitleDialog } from "@/client/components/ProjectTitleDialog";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { loadEngine, type Engine } from "@/client/calligraphy/engine";
import { layout as layOut, type Layout } from "@/client/calligraphy/layout";
import { toSvg } from "@/client/calligraphy/render";
import { Canvas } from "@/client/editor/Canvas";
import { ExportMenu } from "@/client/editor/ExportMenu";
import { LetterPanel, MirrorPanel, TextPanel, moveLetter } from "@/client/editor/Panels";
import { ShareDialog } from "@/client/editor/ShareDialog";
import { useHistory } from "@/client/editor/useHistory";
import { errorMessage } from "@/client/lib/preview";
import { NEUTRAL_LETTER, type Composition, type StyleId } from "@/lib/composition";
import {
  copyProject,
  deleteProject,
  getProject,
  renameProject,
  saveDesign,
  setTemplate,
} from "@/serverFunctions/projects";

export const Route = createFileRoute("/projects/$projectId")({
  // The editor shapes text with WebAssembly in the browser.
  ssr: false,
  loader: ({ params }) => getProject({ data: { id: params.projectId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.project?.title ?? "Project"} · Calligraphy Studio` }],
  }),
  component: ProjectPage,
});

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>["project"]>;

const BACK = (
  <Link
    to="/"
    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
  >
    <ChevronLeft className="size-4" aria-hidden />
    Projects
  </Link>
);

function ProjectPage() {
  const { project } = Route.useLoaderData();
  if (!project) {
    return (
      <AppShell nav={<AppNav />}>
        <div data-testid="project-not-found">
          <EmptyState
            kind="filtered"
            title="Project not found"
            description="It may have been deleted, or it isn't shared with you."
            action={
              <Button nativeButton={false} render={<Link to="/" />}>
                Go to projects
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }
  return <Editor key={project.id} project={project} />;
}

function useEngine(style: StyleId) {
  const [engines, setEngines] = useState<Partial<Record<StyleId, Engine>>>({});
  const [failed, setFailed] = useState<StyleId | null>(null);
  useEffect(() => {
    let live = true;
    loadEngine(style)
      .then((engine) => live && setEngines((all) => ({ ...all, [style]: engine })))
      .catch(() => live && setFailed(style));
    return () => {
      live = false;
    };
  }, [style]);
  return { engine: engines[style] ?? null, failed: failed === style };
}

type SaveState = "saved" | "saving" | "dirty" | "error";

function Editor({ project }: { project: Project }) {
  const router = useRouter();
  const navigate = useNavigate();
  const editable = project.access === "owner" || project.access === "editor";
  const isOwner = project.access === "owner";
  const history = useHistory(project.composition);
  const { composition } = history;
  const { engine, failed } = useEngine(composition.style);

  const [title, setTitle] = useState(project.title);
  const [isTemplate, setIsTemplate] = useState(project.isTemplate);
  const [tab, setTab] = useState("text");
  const [selected, setSelected] = useState<string | null>(null);
  const [half, setHalf] = useState<"original" | "copy">("original");
  const [dialog, setDialog] = useState<"rename" | "delete" | "share" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // The last layout drawn: kept on screen while another style's font loads.
  const lastLayout = useRef<Layout | null>(null);
  const current = useMemo(
    () => (engine ? layOut(composition, engine) : null),
    [composition, engine],
  );
  if (current) lastLayout.current = current;
  const shown = current ?? lastLayout.current;

  // Saving: every change is stored a moment after the last edit.
  const [save, setSave] = useState<SaveState>("saved");
  const stored = useRef(composition);
  const revision = useRef(0);
  useEffect(() => {
    if (!editable) return;
    if (composition === stored.current) {
      revision.current += 1;
      setSave("saved");
      return;
    }
    revision.current += 1;
    const mine = revision.current;
    setSave("dirty");
    if (!current) return;
    const timer = setTimeout(async () => {
      setSave("saving");
      try {
        await saveDesign({
          data: { id: project.id, composition, preview: toSvg(current, composition) },
        });
        stored.current = composition;
        if (revision.current === mine) setSave("saved");
      } catch (error) {
        if (revision.current === mine) {
          setSave("error");
          toast.error(`Not saved: ${errorMessage(error)}`);
        }
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [composition, current, editable, project.id]);

  // Leaving with unsaved work asks first.
  useEffect(() => {
    if (save === "saved") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const { undo, redo } = history;
  useEffect(() => {
    if (!editable) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, undo, redo]);

  const dragBase = useRef<{ base: Composition; x: number; y: number } | null>(null);
  const handlers = {
    onSelect: useCallback((key: string | null) => {
      setSelected(key);
      if (key) setTab("letter");
    }, []),
    onDrag: (key: string, dx: number, dy: number) => {
      if (!dragBase.current) {
        const at = composition.letters[key] ?? NEUTRAL_LETTER;
        dragBase.current = { base: composition, x: at.x, y: at.y };
      }
      const { x, y } = dragBase.current;
      history.preview((c) => moveLetter(c, key, x + dx, y + dy));
    },
    onDragEnd: () => {
      if (dragBase.current) history.commit(dragBase.current.base);
      dragBase.current = null;
    },
  };

  async function act(name: string, work: () => Promise<void>) {
    setBusy(name);
    try {
      await work();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const saveLabel: Record<SaveState, string> = {
    saved: "Saved",
    saving: "Saving…",
    dirty: "Saving…",
    error: "Not saved",
  };

  const actions = (
    <>
      {editable ? (
        <>
          <span
            data-testid="save-status"
            data-dirty={save === "saved" ? "false" : "true"}
            aria-live="polite"
            className={save === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          >
            {saveLabel[save]}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Undo"
            data-testid="undo"
            disabled={!history.canUndo}
            onClick={history.undo}
          >
            <Undo2 aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Redo"
            data-testid="redo"
            disabled={!history.canRedo}
            onClick={history.redo}
          >
            <Redo2 aria-hidden />
          </Button>
        </>
      ) : (
        <Badge variant="secondary" data-testid="view-only">
          View only
        </Badge>
      )}
      <ExportMenu title={title} layout={shown} composition={composition} />
      {isOwner ? (
        <>
          <Button variant="outline" data-testid="share-button" onClick={() => setDialog("share")}>
            <Share2 data-icon="inline-start" aria-hidden />
            Share
          </Button>
          {isTemplate ? (
            <Button
              variant="outline"
              data-testid="unpublish-button"
              pending={busy === "template"}
              onClick={() =>
                act("template", async () => {
                  await setTemplate({ data: { id: project.id, published: false } });
                  setIsTemplate(false);
                })
              }
            >
              Unpublish template
            </Button>
          ) : (
            <Button
              variant="outline"
              data-testid="publish-button"
              pending={busy === "template"}
              onClick={() =>
                act("template", async () => {
                  await setTemplate({ data: { id: project.id, published: true } });
                  setIsTemplate(true);
                  toast.success("Published to Templates");
                })
              }
            >
              Publish as template
            </Button>
          )}
        </>
      ) : null}
      <Button
        variant="outline"
        data-testid="copy-button"
        pending={busy === "copy"}
        onClick={() =>
          act("copy", async () => {
            const copy = await copyProject({ data: { id: project.id } });
            await navigate({ to: "/projects/$projectId", params: { projectId: copy.id } });
          })
        }
      >
        <Copy data-icon="inline-start" aria-hidden />
        Make a copy
      </Button>
      {isOwner ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="More" data-testid="project-menu" />
            }
          >
            <MoreHorizontal aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDialog("rename")}>Rename</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );

  return (
    <AppShell nav={<AppNav />} wide>
      <PageHeader
        backLink={BACK}
        title={title}
        description={project.ownerEmail ? `Shared by ${project.ownerEmail}` : undefined}
        actions={actions}
      />
      <div className={editable ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" : "mx-auto max-w-2xl"}>
        <Card className="mx-auto w-full max-w-[min(100%,calc(100dvh-14rem))] self-start overflow-hidden p-0">
          <div className="aspect-square w-full">
            {failed ? (
              <div className="flex size-full items-center justify-center p-6">
                <EmptyState
                  kind="error"
                  variant="plain"
                  title="This style didn't load"
                  description="Check your connection and reload the page."
                />
              </div>
            ) : (
              <Canvas
                layout={shown}
                composition={composition}
                ready={current !== null}
                selected={tab === "letter" ? selected : null}
                editable={editable}
                handlers={handlers}
              />
            )}
          </div>
        </Card>
        {editable ? (
          <Card className="p-4">
            <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
              <TabsList className="w-full">
                <TabsTrigger value="text">Text</TabsTrigger>
                <TabsTrigger value="letter">Letter</TabsTrigger>
                <TabsTrigger value="mirror">Mirror</TabsTrigger>
              </TabsList>
              <TabsContent value="text" className="pt-4">
                <TextPanel composition={composition} change={history.change} />
              </TabsContent>
              <TabsContent value="letter" className="pt-4">
                <LetterPanel composition={composition} selected={selected} change={history.change} />
              </TabsContent>
              <TabsContent value="mirror" className="pt-4">
                <MirrorPanel
                  composition={composition}
                  half={half}
                  onHalf={setHalf}
                  change={history.change}
                />
              </TabsContent>
            </Tabs>
          </Card>
        ) : null}
      </div>

      {dialog === "share" ? (
        <ShareDialog projectId={project.id} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "rename" ? (
        <ProjectTitleDialog
          title="Rename project"
          submitLabel="Rename"
          initial={title}
          onClose={() => setDialog(null)}
          onSubmit={async (next) => {
            const renamed = await renameProject({ data: { id: project.id, title: next } });
            setTitle(renamed.title);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "delete" ? (
        <ConfirmDialog
          title={`Delete “${title}”?`}
          confirmLabel="Delete"
          destructive
          confirmTestId="confirm-delete"
          pending={busy === "delete"}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            act("delete", async () => {
              await deleteProject({ data: { id: project.id } });
              await router.invalidate();
              await navigate({ to: "/" });
            })
          }
        >
          It is removed for everyone it is shared with.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
