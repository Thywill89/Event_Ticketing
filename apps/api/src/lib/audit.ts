import type { Prisma } from "../../prisma/generated";
import { prisma } from "../db";

type TxClient = Prisma.TransactionClient;

export async function writeAuditLog(
  input: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  client: TxClient | typeof prisma = prisma,
) {
  return client.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}
