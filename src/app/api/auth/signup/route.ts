import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { handleApiError } from "@/lib/scope";

const schema = z.object({
  companyName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return NextResponse.json({ error: "Esiste già un utente con questa email" }, { status: 409 });
    }

    const passwordHash = await hashPassword(body.password);

    const { user, company } = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: body.companyName } });
      const user = await tx.user.create({
        data: {
          companyId: company.id,
          email: body.email,
          name: body.name,
          passwordHash,
          role: "ADMIN",
        },
      });
      // integrazioni non ancora collegate: stato iniziale visibile in Impostazioni
      await tx.integrationConfig.createMany({
        data: [
          { companyId: company.id, provider: "OPENAI", connected: false },
          { companyId: company.id, provider: "SERPER", connected: false },
          { companyId: company.id, provider: "GMAIL", connected: false },
        ],
      });
      return { user, company };
    });

    await createSession({ userId: user.id, companyId: company.id, role: user.role });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
