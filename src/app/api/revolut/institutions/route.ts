import { withApi } from "@/lib/http";
import { listInstitutions } from "@/lib/revolut/gocardless";
import { requireUserId } from "@/lib/session";
import { revolutInstitutionsQuerySchema } from "@/lib/validators";

export async function GET(request: Request) {
  return withApi(async () => {
    await requireUserId();
    const url = new URL(request.url);
    const country = url.searchParams.get("country") ?? "";
    const { country: cc } = revolutInstitutionsQuerySchema.parse({ country });

    const institutions = await listInstitutions(cc);
    const revolut = institutions.filter((i) => /revolut/i.test(i.name));

    return { institutions: revolut.length ? revolut : institutions };
  });
}
