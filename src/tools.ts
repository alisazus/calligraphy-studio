// The app's tools for AI clients. The Gateway serves them at /mcp and calls
// each with the signed-in user.
import { defineTools, isAdmin } from "@every-app/sdk/server";
import { z } from "zod";
import * as projects from "@/server/projects";

export const tools = defineTools({
  list_projects: {
    description:
      "List the user's calligraphy projects and those shared with them, newest first, with each one's title and the user's access.",
    risk: "read",
    input: z.object({}).strict(),
    handler: async (_input, { user }) => {
      const list = await projects.listProjects({
        id: user.id,
        email: user.email,
        orgId: user.orgId,
        admin: isAdmin(user),
      });
      return list.map(({ preview: _preview, ...project }) => project);
    },
  },
  list_templates: {
    description: "List the templates published in this organization.",
    risk: "read",
    input: z.object({}).strict(),
    handler: async (_input, { user }) => {
      const list = await projects.listTemplates({
        id: user.id,
        email: user.email,
        orgId: user.orgId,
        admin: isAdmin(user),
      });
      return list.map(({ preview: _preview, ...template }) => template);
    },
  },
});
