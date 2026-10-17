import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function outputText(response: any): string {
  for (const item of response?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content ?? []) if (content?.type === "output_text") return String(content.text ?? "");
  }
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return reply({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const openAiKey = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();
  const model = (Deno.env.get("OPENAI_DOCUMENT_MODEL") || Deno.env.get("OPENAI_REASONING_MODEL") || "gpt-6-sol").trim();
  if (!openAiKey) return reply({ error: "OPENAI_API_KEY is missing" }, 503);

  let body: { document_id?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON" }, 400); }
  if (!body.document_id) return reply({ error: "document_id is required" }, 400);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const documentResult = await supabase.from("knowledge_technical_documents")
    .select("id,workspace_id,item_id,work_id,movement_id,title,url,storage_bucket,storage_path,mime_type,document_type,reference_text")
    .eq("id", body.document_id).single();
  if (documentResult.error || !documentResult.data) return reply({ error: documentResult.error?.message ?? "Document not found" }, 404);
  const document = documentResult.data;

  let fileUrl = String(document.url ?? "").trim();
  if (document.storage_bucket && document.storage_path) {
    const signed = await supabase.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 60 * 10);
    if (signed.error || !signed.data?.signedUrl) return reply({ error: signed.error?.message ?? "Stored PDF could not be opened" }, 400);
    fileUrl = signed.data.signedUrl;
  }
  if (!fileUrl) return reply({ error: "This reference has no readable PDF URL or stored file." }, 400);
  if (document.mime_type && document.mime_type !== "application/pdf" && !/\.pdf(?:$|[?#])/i.test(fileUrl)) {
    return reply({ error: "Page extraction currently supports PDF references only." }, 415);
  }

  const schema = {
    type: "object", additionalProperties: false,
    properties: {
      summary: { type: "string" },
      page_count_observed: { type: ["integer", "null"] },
      findings: { type: "array", maxItems: 30, items: {
        type: "object", additionalProperties: false,
        properties: {
          topic: { type: "string" }, finding: { type: "string" }, page_from: { type: "integer", minimum: 1 }, page_to: { type: "integer", minimum: 1 },
          confidence: { type: "string", enum: ["confirmed", "strong", "probable", "possible", "unknown"] }, evidence_note: { type: "string" }
        }, required: ["topic", "finding", "page_from", "page_to", "confidence", "evidence_note"]
      }}
    }, required: ["summary", "page_count_observed", "findings"]
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [
        { type: "input_file", file_url: fileUrl, filename: `${String(document.title || "calibre-reference").replace(/[^a-z0-9._-]+/gi, "-")}.pdf`, detail: "high" },
        { type: "input_text", text: `Read this watchmaking reference as evidence. Extract only facts useful to watch identification, servicing, lubrication, specifications, parts, compatibility, fault diagnosis or historical context. Every finding MUST name the PDF page number where the evidence appears. Page numbers refer to PDF pages as rendered, starting at 1. Do not infer unsupported specifications. Keep evidence_note short and paraphrased. Document context: ${JSON.stringify({ title: document.title, document_type: document.document_type, reference_text: document.reference_text })}` }
      ]}],
      text: { format: { type: "json_schema", name: "calibre_pdf_evidence", strict: true, schema } }
    })
  });

  const payload = await response.json();
  if (!response.ok) return reply({ error: payload?.error?.message ?? `OpenAI returned ${response.status}` }, 502);
  const raw = outputText(payload);
  let extracted: any;
  try { extracted = JSON.parse(raw); } catch { return reply({ error: "PDF extraction returned invalid structured output" }, 502); }

  const update = await supabase.from("knowledge_technical_documents").update({
    searchable_text_status: "extracted",
    page_count: extracted.page_count_observed ?? null,
    notes: `PDF evidence extracted by Calibre. ${extracted.summary || ""}`.trim(),
  }).eq("id", document.id).eq("workspace_id", document.workspace_id);
  if (update.error) return reply({ error: update.error.message }, 500);

  const links = (extracted.findings ?? []).map((finding: any) => ({
    workspace_id: document.workspace_id,
    document_id: document.id,
    item_id: document.item_id,
    work_id: document.work_id,
    movement_id: document.movement_id,
    link_kind: "page_evidence",
    relevance_note: `${finding.topic}: ${finding.finding} [${finding.confidence}] ${finding.evidence_note}`.slice(0, 1800),
    page_from: finding.page_from,
    page_to: finding.page_to,
  }));
  if (links.length) {
    const inserted = await supabase.from("knowledge_document_links").insert(links);
    if (inserted.error) return reply({ error: inserted.error.message }, 500);
  }

  return reply({ document_id: document.id, summary: extracted.summary, finding_count: links.length, findings: extracted.findings ?? [] });
});
