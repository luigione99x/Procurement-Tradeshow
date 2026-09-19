import { NextResponse } from "next/server";
import { authOrThrow, handleApiError } from "@/lib/scope";
import { allIntegrationStatuses } from "@/lib/integrations";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const user = await authOrThrow();
    const statuses = allIntegrationStatuses();
    const records = await prisma.integrationConfig.findMany({ where: { companyId: user.companyId } });
    const merged = statuses.map((s) => ({
      ...s,
      record: records.find((r) => r.provider === s.provider) || null,
    }));
    return NextResponse.json({ integrazioni: merged });
  } catch (err) {
    return handleApiError(err);
  }
}
