import { getMappings, saveMappings } from "../store/mappings";
import { mappingEditor } from "../templates/components";

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}

export async function handleSettingsRoute(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // GET /settings/mappings/:wordListId — Load mapping editor fragment
  const getMappingMatch = path.match(/^\/settings\/mappings\/([^/]+)$/);
  if (method === "GET" && getMappingMatch) {
    const wordListId = decodeURIComponent(getMappingMatch[1]);
    const mapping = getMappings(wordListId);
    return html(mappingEditor(mapping.pairs, wordListId, mapping.version));
  }

  // PUT /settings/mappings/:wordListId — Save mapping pairs
  if (method === "PUT" && getMappingMatch) {
    const wordListId = decodeURIComponent(getMappingMatch[1]);
    const formData = await req.formData();

    // Collect pairs from form: from_0, to_0, from_1, to_1, ...
    // The form uses name="from" and name="to" for each pair row
    const fromValues = formData.getAll("from");
    const toValues = formData.getAll("to");

    const pairs: [string, string][] = [];
    const count = Math.min(fromValues.length, toValues.length);
    for (let i = 0; i < count; i++) {
      const from = (fromValues[i] as string).trim();
      const to = (toValues[i] as string).trim();
      if (from && to) {
        pairs.push([from, to]);
      }
    }

    saveMappings(wordListId, pairs);

    const updated = getMappings(wordListId);
    return html(mappingEditor(updated.pairs, wordListId, updated.version));
  }

  return null;
}
