import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIDENCE = new Set(["confirmed", "strong", "probable", "possible", "unknown"]);

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

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanPage(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.round(value)) : null;
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
    .select("id,workspace_id,title,url,storage_bucket,storage_path,mime_type,document_type,reference_text")
    .eq("id", body.document_id).single();
  if (documentResult.error || !documentResult.data) return reply({ error: documentResult.error?.message ?? "Document not found" }, 404);
  const document = documentResult.data;
  if (!document.workspace_id) return reply({ error: "This Library document is not assigned to a workspace yet." }, 409);

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
        { type: "input_file", file_url: fileUrl, detail: "high" },
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

  const findings = (Array.isArray(extracted?.findings) ? extracted.findings : []).flatMap((finding: any) => {
    const pageFrom = cleanPage(finding?.page_from);
    const pageToRaw = cleanPage(finding?.page_to);
    const pageTo = pageFrom && pageToRaw ? Math.max(pageFrom, pageToRaw) : pageFrom;
    const topic = cleanText(finding?.topic, 160);
    const fact = cleanText(finding?.finding, 1800);
    const evidenceNote = cleanText(finding?.evidence_note, 1000);
    const confidence = cleanText(finding?.confidence, 32).toLowerCase();
    if (!pageFrom || !pageTo || !topic || !fact || !CONFIDENCE.has(confidence)) return [];
    return [{ topic, finding: fact, page_from: pageFrom, page_to: pageTo, confidence, evidence_note: evidenceNote }];
  }).slice(0, 30);

  const extractionRunId = crypto.randomUUID();
  if (findings.length) {
    const inserted = await supabase.from("knowledge_document_findings").insert(findings.map((finding: any) => ({
      workspace_id: document.workspace_id,
      document_id: document.id,
      extraction_run_id: extractionRunId,
      ...finding,
      source_kind: "pdf_extraction",
      extraction_model: model,
      review_status: "candidate",
    })));
    if (inserted.error) return reply({ error: inserted.error.message }, 500);

    const cleanedOld = await supabase.from("knowledge_document_findings")
      .delete()
      .eq("workspace_id", document.workspace_id)
      .eq("document_id", document.id)
      .eq("source_kind", "pdf_extraction")
      .neq("extraction_run_id", extractionRunId);
    if (cleanedOld.error) return reply({ error: cleanedOld.error.message }, 500);
  } else {
    const cleared = await supabase.from("knowledge_document_findings")
      .delete()
      .eq("workspace_id", document.workspace_id)
      .eq("document_id", document.id)
      .eq("source_kind", "pdf_extraction");
    if (cleared.error) return reply({ error: cleared.error.message }, 500);
  }

  const observedPages = cleanPage(extracted?.page_count_observed);
  const summary = cleanText(extracted?.summary, 4000);
  const update = await supabase.from("knowledge_technical_documents").update({
    searchable_text_status: "extracted",
    page_count: observedPages,
    extraction_summary: summary,
    extraction_model: model,
    extracted_at: new Date().toISOString(),
  }).eq("id", document.id).eq("workspace_id", document.workspace_id);
  if (update.error) return reply({ error: update.error.message }, 500);

  return reply({ document_id: document.id, extraction_run_id: extractionRunId, summary, finding_count: findings.length, findings });
});
