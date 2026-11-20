import { useState } from "react";
import { FormDialog } from "@/client/components/FormDialog";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { errorMessage } from "@/client/lib/preview";

/** Asks for a project's title, to create a project or rename one. */
export function ProjectTitleDialog({
  title,
  submitLabel,
  initial = "",
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  initial?: string;
  onSubmit: (title: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(value.trim());
    } catch (failure) {
      setError(errorMessage(failure));
      setPending(false);
    }
  }

  return (
    <FormDialog
      title={title}
      onClose={() => (pending ? undefined : onClose())}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="project-title-form"
            pending={pending}
            disabled={!value.trim()}
            data-testid="project-title-submit"
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id="project-title-form" onSubmit={submit} className="space-y-2">
        <Label htmlFor="project-title">Title</Label>
        <Input
          id="project-title"
          data-testid="project-title-input"
          value={value}
          maxLength={120}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    </FormDialog>
  );
}
