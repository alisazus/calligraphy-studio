import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { isAdmin } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import * as projects from "@/server/projects";

type GatewayUser = Parameters<typeof isAdmin>[0] & {
  id: string;
  email: string;
  orgId: string;
};

/** The signed-in member, recorded on first sight. */
async function actorOf(user: GatewayUser): Promise<projects.Actor> {
  const actor = {
    id: user.id,
    email: user.email,
    orgId: user.orgId,
    admin: isAdmin(user),
  };
  await projects.rememberUser(actor);
  return actor;
}

/** A refusal answers with its own status, not 200. */
async function refused<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof projects.ProjectError) setResponseStatus(error.status);
    throw error;
  }
}

export const getProjects = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) =>
    projects.listProjects(await actorOf(context.user)),
  );

export const getProject = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context }) => {
    try {
      return {
        project: await projects.getProject(await actorOf(context.user), data.id),
      };
    } catch (error) {
      if (error instanceof projects.ProjectError) return { project: null };
      throw error;
    }
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.createProjectInput.parse(data))
  .handler(async ({ data, context }) =>
    projects.createProject(await actorOf(context.user), data),
  );

export const copyProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) =>
    refused(async () =>
      projects.copyProject(await actorOf(context.user), data),
    ),
  );

export const renameProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.renameProjectInput.parse(data))
  .handler(({ data, context }) =>
    refused(async () =>
      projects.renameProject(await actorOf(context.user), data),
    ),
  );

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) =>
    refused(async () =>
      projects.deleteProject(await actorOf(context.user), data),
    ),
  );

export const saveDesign = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.saveDesignInput.parse(data))
  .handler(({ data, context }) =>
    refused(async () =>
      projects.saveDesign(await actorOf(context.user), data),
    ),
  );

export const getShares = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) =>
    refused(async () =>
      projects.listShares(await actorOf(context.user), data),
    ),
  );

export const shareProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.shareInput.parse(data))
  .handler(({ data, context }) =>
    refused(async () =>
      projects.shareProject(await actorOf(context.user), data),
    ),
  );

export const unshareProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.unshareInput.parse(data))
  .handler(({ data, context }) =>
    refused(async () =>
      projects.unshareProject(await actorOf(context.user), data),
    ),
  );

export const setTemplate = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.templateInput.parse(data))
  .handler(({ data, context }) =>
    refused(async () =>
      projects.setTemplate(await actorOf(context.user), data),
    ),
  );

export const getTemplates = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) =>
    projects.listTemplates(await actorOf(context.user)),
  );
