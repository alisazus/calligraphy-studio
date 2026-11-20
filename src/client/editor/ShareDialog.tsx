import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { Spinner } from "@/client/components/ui/spinner";
import { errorMessage } from "@/client/lib/preview";
import {
  getShares,
  shareProject,
  unshareProject,
} from "@/serverFunctions/projects";

type Role = "viewer" | "editor";
interface Share {
  userId: string;
  email: string;
  role: Role;
}

const ROLE_LABEL: Record<Role, string> = { viewer: "Viewer", editor: "Editor" };

export function ShareDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const emailId = useId();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getShares({ data: { id: projectId } })
      .then(setShares)
      .catch((failure) => setError(errorMessage(failure)));
  }, [projectId]);

  async function run(work: () => Promise<Share[]>) {
    setPending(true);
    setError(null);
    try {
      setShares(await work());
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!email.trim()) return;
            const done = await run(() =>
              shareProject({ data: { id: projectId, email: email.trim(), role } }),
            );
            if (done) setEmail("");
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={emailId}>Member's email</Label>
            <Input
              id={emailId}
              type="email"
              data-testid="share-email"
              value={email}
              autoComplete="off"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              aria-label="Access"
              variant="outline"
              spacing={0}
              value={[role]}
              onValueChange={(next: string[]) => {
                if (next[0] === "viewer" || next[0] === "editor") setRole(next[0]);
              }}
            >
              <ToggleGroupItem value="viewer" data-testid="share-role-viewer">
                Can view
              </ToggleGroupItem>
              <ToggleGroupItem value="editor" data-testid="share-role-editor">
                Can edit
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              type="submit"
              data-testid="share-submit"
              pending={pending}
              disabled={!email.trim()}
            >
              Share
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        {shares === null ? (
          error ? null : <Spinner />
        ) : shares.length === 0 ? null : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {shares.map((share) => (
              <li
                key={share.userId}
                data-testid="share-row"
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">{share.email}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground">{ROLE_LABEL[share.role]}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Stop sharing with ${share.email}`}
                    data-testid="share-remove"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        unshareProject({ data: { id: projectId, userId: share.userId } }),
                      )
                    }
                  >
                    <X aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
