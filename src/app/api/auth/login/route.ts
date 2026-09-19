import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { handleApiError } from "@/lib/scope";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
    }
    await createSession({ userId: user.id, companyId: user.companyId, role: user.role });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
