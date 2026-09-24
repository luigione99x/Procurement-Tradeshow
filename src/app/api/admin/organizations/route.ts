import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { createClientOrganization, listOrganizations } from "@/lib/access";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";

export async function GET() {
  try {
    return NextResponse.json({ organizations: await listOrganizations(getDb(), await requireActor()) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    return NextResponse.json({ organization: await createClientOrganization(getDb(), await requireActor(), await req.json()) }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
