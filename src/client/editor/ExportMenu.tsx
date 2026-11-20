import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import type { Composition } from "@/lib/composition";
import type { Layout } from "@/client/calligraphy/layout";
import { download, fileName, toPdf, toPng, toSvg } from "@/client/calligraphy/render";
import { errorMessage } from "@/client/lib/preview";

const PNG_WIDTH = 2000;

export function ExportMenu({
  title,
  layout,
  composition,
}: {
  title: string;
  layout: Layout | null;
  composition: Composition;
}) {
  async function run(kind: "png" | "png-transparent" | "svg" | "outline" | "pdf") {
    if (!layout) return;
    try {
      switch (kind) {
        case "png":
          download(await toPng(toSvg(layout, composition), PNG_WIDTH), fileName(title, "", "png"));
          break;
        case "png-transparent":
          download(
            await toPng(toSvg(layout, composition, "transparent"), PNG_WIDTH),
            fileName(title, " (transparent)", "png"),
          );
          break;
        case "svg":
          download(svgBlob(toSvg(layout, composition)), fileName(title, "", "svg"));
          break;
        case "outline":
          download(
            svgBlob(toSvg(layout, composition, "outline")),
            fileName(title, " (outline)", "svg"),
          );
          break;
        case "pdf":
          download(toPdf(layout, composition), fileName(title, "", "pdf"));
          break;
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const items = [
    { kind: "png", label: "PNG", testId: "export-png" },
    { kind: "png-transparent", label: "PNG, transparent", testId: "export-png-transparent" },
    { kind: "svg", label: "SVG", testId: "export-svg" },
    { kind: "outline", label: "Outline SVG", testId: "export-outline" },
    { kind: "pdf", label: "PDF", testId: "export-pdf" },
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" data-testid="export-menu" disabled={!layout} />}
      >
        <Download data-icon="inline-start" aria-hidden />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.kind}
            data-testid={item.testId}
            onClick={() => void run(item.kind)}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function svgBlob(svg: string): Blob {
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`], {
    type: "image/svg+xml",
  });
}
