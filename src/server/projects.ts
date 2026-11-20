import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projectShares, projects, users } from "@/db/schema";
import {
  compositionSchema,
  defaultComposition,
  previewSchema,
  type Composition,
} from "@/lib/composition";

/** Who is asking: the Gateway's verified user, reduced to what queries need. */
export interface Actor {
  id: string;
  email: string;
  orgId: string;
  admin: boolean;
}

export type Access = "owner" | "editor" | "viewer" | "template";

const id = z.string().uuid();
const title = z.string().trim().min(1, "Give the project a title").max(120);

export const projectIdInput = z.object({ id }).strict();
export const createProjectInput = z.object({ title }).strict();
export const renameProjectInput = z.object({ id, title }).strict();
export const saveDesignInput = z
  .object({ id, composition: compositionSchema, preview: previewSchema })
  .strict();
export const shareInput = z
  .object({
    id,
    email: z.string().trim().toLowerCase().email("Enter an email address"),
    role: z.enum(["viewer", "editor"]),
  })
  .strict();
export const unshareInput = z.object({ id, userId: z.string().min(1) }).strict();
export const templateInput = z.object({ id, published: z.boolean() }).strict();

/** A message the page may show as it is, with the HTTP status it means. */
export class ProjectError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 = 404,
  ) {
    super(message);
  }
}

const now = () => new Date().toISOString();

/** Records the member on first sight, and keeps their email current. */
export async function rememberUser(actor: Actor): Promise<void> {
  await db
    .insert(users)
    .values({
      id: actor.id,
      email: actor.email.toLowerCase(),
      orgId: actor.orgId,
      createdAt: now(),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: actor.email.toLowerCase(), orgId: actor.orgId },
    });
}

/** What the actor may do with a project, or null when they may not see it. */
async function accessTo(
  actor: Actor,
  projectId: string,
): Promise<{ access: Access; ownerId: string; isTemplate: boolean } | null> {
  const [found] = await db
    .select({
      ownerId: projects.ownerId,
      isTemplate: projects.isTemplate,
      shareRole: projectShares.role,
    })
    .from(projects)
    .leftJoin(
      projectShares,
      and(
        eq(projectShares.projectId, projects.id),
        eq(projectShares.userId, actor.id),
      ),
    )
    .where(eq(projects.id, projectId));
  if (!found) return null;
  const base = { ownerId: found.ownerId, isTemplate: found.isTemplate };
  if (found.ownerId === actor.id) return { access: "owner", ...base };
  if (found.shareRole) return { access: found.shareRole, ...base };
  if (found.isTemplate) return { access: "template", ...base };
  return null;
}

function notFound(): never {
  throw new ProjectError("Project not found");
}

export interface ProjectSummary {
  id: string;
  title: string;
  preview: string | null;
  access: Access;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The actor's own projects and those shared with them, newest first. */
export async function listProjects(actor: Actor): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      preview: projects.preview,
      ownerId: projects.ownerId,
      ownerEmail: users.email,
      shareRole: projectShares.role,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .leftJoin(
      projectShares,
      and(
        eq(projectShares.projectId, projects.id),
        eq(projectShares.userId, actor.id),
      ),
    )
    .leftJoin(users, eq(users.id, projects.ownerId))
    .where(
      or(eq(projects.ownerId, actor.id), eq(projectShares.userId, actor.id)),
    )
    .orderBy(desc(projects.createdAt), desc(projects.id));
  return rows.map(({ ownerId, shareRole, ownerEmail, ...row }) => ({
    ...row,
    access: ownerId === actor.id ? "owner" : (shareRole ?? "viewer"),
    ownerEmail: ownerId === actor.id ? null : ownerEmail,
  }));
}

export interface ProjectDetail {
  id: string;
  title: string;
  composition: Composition;
  isTemplate: boolean;
  access: Access;
  ownerEmail: string | null;
}

export async function getProject(
  actor: Actor,
  projectId: string,
): Promise<ProjectDetail> {
  const access = await accessTo(actor, projectId);
  if (!access) notFound();
  const [row] = await db
    .select({
      id: projects.id,
      title: projects.title,
      composition: projects.composition,
      isTemplate: projects.isTemplate,
      ownerEmail: users.email,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.ownerId))
    .where(eq(projects.id, projectId));
  if (!row) notFound();
  return {
    ...row,
    composition: parseComposition(row.composition),
    access: access.access,
    ownerEmail: access.access === "owner" ? null : row.ownerEmail,
  };
}

function parseComposition(json: string): Composition {
  const parsed = compositionSchema.safeParse(JSON.parse(json));
  return parsed.success ? parsed.data : defaultComposition();
}

export async function createProject(
  actor: Actor,
  input: z.infer<typeof createProjectInput>,
  from?: { composition: string; preview: string | null },
): Promise<{ id: string }> {
  const at = now();
  const [created] = await db
    .insert(projects)
    .values({
      id: crypto.randomUUID(),
      ownerId: actor.id,
      title: input.title,
      composition: from?.composition ?? JSON.stringify(defaultComposition()),
      preview: from?.preview ?? null,
      createdAt: at,
      updatedAt: at,
    })
    .returning({ id: projects.id });
  return created!;
}

/** A new project of the actor's own, from any project they can read. */
export async function copyProject(
  actor: Actor,
  { id: sourceId }: z.infer<typeof projectIdInput>,
): Promise<{ id: string }> {
  if (!(await accessTo(actor, sourceId))) notFound();
  const [source] = await db
    .select({
      title: projects.title,
      composition: projects.composition,
      preview: projects.preview,
    })
    .from(projects)
    .where(eq(projects.id, sourceId));
  if (!source) notFound();
  return createProject(actor, { title: source.title }, source);
}

export async function renameProject(
  actor: Actor,
  input: z.infer<typeof renameProjectInput>,
): Promise<{ id: string; title: string }> {
  const [row] = await db
    .update(projects)
    .set({ title: input.title, updatedAt: now() })
    .where(and(eq(projects.id, input.id), eq(projects.ownerId, actor.id)))
    .returning({ id: projects.id, title: projects.title });
  return row ?? notFound();
}

export async function deleteProject(
  actor: Actor,
  { id: projectId }: z.infer<typeof projectIdInput>,
): Promise<void> {
  const owned = and(eq(projects.id, projectId), eq(projects.ownerId, actor.id));
  const [found] = await db.select({ id: projects.id }).from(projects).where(owned);
  if (!found) notFound();
  await db.batch([
    db.delete(projectShares).where(eq(projectShares.projectId, projectId)),
    db.delete(projects).where(owned),
  ]);
}

/** Saves the design. Only the owner or an editor may; one statement decides. */
export async function saveDesign(
  actor: Actor,
  input: z.infer<typeof saveDesignInput>,
): Promise<{ updatedAt: string }> {
  const at = now();
  const [row] = await db
    .update(projects)
    .set({
      composition: JSON.stringify(input.composition),
      preview: input.preview,
      updatedAt: at,
    })
    .where(
      and(
        eq(projects.id, input.id),
        or(
          eq(projects.ownerId, actor.id),
          sql`exists (select 1 from ${projectShares} where ${projectShares.projectId} = ${projects.id} and ${projectShares.userId} = ${actor.id} and ${projectShares.role} = 'editor')`,
        ),
      ),
    )
    .returning({ updatedAt: projects.updatedAt });
  return row ?? notFound();
}

async function requireOwner(actor: Actor, projectId: string): Promise<void> {
  const access = await accessTo(actor, projectId);
  if (!access) notFound();
  if (access.access !== "owner")
    throw new ProjectError("Only the project's owner can do that", 403);
}

export interface Share {
  userId: string;
  email: string;
  role: "viewer" | "editor";
}

export async function listShares(
  actor: Actor,
  { id: projectId }: z.infer<typeof projectIdInput>,
): Promise<Share[]> {
  await requireOwner(actor, projectId);
  return db
    .select({
      userId: projectShares.userId,
      email: users.email,
      role: projectShares.role,
    })
    .from(projectShares)
    .innerJoin(users, eq(users.id, projectShares.userId))
    .where(eq(projectShares.projectId, projectId))
    .orderBy(users.email);
}

/** Shares with a member of the same organization, or changes their role. */
export async function shareProject(
  actor: Actor,
  input: z.infer<typeof shareInput>,
): Promise<Share[]> {
  await requireOwner(actor, input.id);
  const [person] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.email, input.email),
        eq(users.orgId, actor.orgId),
        ne(users.id, actor.id),
      ),
    );
  if (!person) {
    throw new ProjectError(
      input.email === actor.email.toLowerCase()
        ? "You already own this project"
        : "No member with that email has opened this app yet",
      400,
    );
  }
  await db
    .insert(projectShares)
    .values({
      projectId: input.id,
      userId: person.id,
      role: input.role,
      createdAt: now(),
    })
    .onConflictDoUpdate({
      target: [projectShares.projectId, projectShares.userId],
      set: { role: input.role },
    });
  return listShares(actor, { id: input.id });
}

export async function unshareProject(
  actor: Actor,
  input: z.infer<typeof unshareInput>,
): Promise<Share[]> {
  await requireOwner(actor, input.id);
  await db
    .delete(projectShares)
    .where(
      and(
        eq(projectShares.projectId, input.id),
        eq(projectShares.userId, input.userId),
      ),
    );
  return listShares(actor, { id: input.id });
}

/** Publishing is the owner's; unpublishing is the owner's or an admin's. */
export async function setTemplate(
  actor: Actor,
  input: z.infer<typeof templateInput>,
): Promise<{ isTemplate: boolean }> {
  const access = await accessTo(actor, input.id);
  if (!access) notFound();
  const allowed =
    access.access === "owner" || (!input.published && actor.admin);
  if (!allowed) throw new ProjectError("Only the project's owner can do that", 403);
  await db
    .update(projects)
    .set({ isTemplate: input.published })
    .where(eq(projects.id, input.id));
  return { isTemplate: input.published };
}

export interface Template {
  id: string;
  title: string;
  preview: string | null;
  ownerEmail: string | null;
  canUnpublish: boolean;
}

export async function listTemplates(actor: Actor): Promise<Template[]> {
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      preview: projects.preview,
      ownerId: projects.ownerId,
      ownerEmail: users.email,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.ownerId))
    .where(eq(projects.isTemplate, true))
    .orderBy(desc(projects.updatedAt), desc(projects.id));
  return rows.map(({ ownerId, ...row }) => ({
    ...row,
    canUnpublish: ownerId === actor.id || actor.admin,
  }));
}

