import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const invoiceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    vendor_name: { type: "string" },
    invoice_number: { type: "string" },
    invoice_date: { anyOf: [{ type: "string" }, { type: "null" }] },
    currency: { type: "string" },
    subtotal: { anyOf: [{ type: "number" }, { type: "null" }] },
    fees: { anyOf: [{ type: "number" }, { type: "null" }] },
    postage: { anyOf: [{ type: "number" }, { type: "null" }] },
    total: { anyOf: [{ type: "number" }, { type: "null" }] },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          line_number: { anyOf: [{ type: "integer" }, { type: "null" }] },
          lot_number: { type: "string" },
          raw_text: { type: "string" },
          title: { type: "string" },
          type: { type: "string", enum: ["watch", "clock", "jewellery", "accessory", "other"] },
          purpose: { type: "string", enum: ["resale", "collection", "repair", "donor", "client", "reference", "other"] },
          quantity: { type: "integer", minimum: 1 },
          unit_price: { anyOf: [{ type: "number" }, { type: "null" }] },
          line_total: { anyOf: [{ type: "number" }, { type: "null" }] },
          confidence: { anyOf: [{ type: "number", minimum: 0, maximum: 1 }, { type: "null" }] },
          review_note: { type: "string" },
        },
        required: [
          "line_number", "lot_number", "raw_text", "title", "type", "purpose",
          "quantity", "unit_price", "line_total", "confidence", "review_note",
        ],
      },
    },
  },
  required: [
    "vendor_name", "invoice_number", "invoice_date", "currency", "subtotal",
    "fees", "postage", "total", "lines",
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function outputText(response: any): string {
  for (const item of response?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content?.text === "string") return content.text;
    }
  }
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  const model = Deno.env.get("OPENAI_INVOICE_MODEL") || "gpt-4o-mini";

  if (!openAiKey) {
    return jsonResponse({ error: "Invoice extractor is not configured yet. Add OPENAI_API_KEY to Supabase Edge Function secrets." }, 503);
  }

  let body: { invoice_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  if (!body.invoice_id) return jsonResponse({ error: "invoice_id is required" }, 400);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: invoice, error: invoiceError } = await supabase
    .from("acquisition_invoices")
    .select("id,workspace_id,original_filename,mime_type,storage_path")
    .eq("id", body.invoice_id)
    .single();

  if (invoiceError || !invoice) return jsonResponse({ error: invoiceError?.message ?? "Invoice not found" }, 404);

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("calibre-media")
    .download(invoice.storage_path);

  if (downloadError || !fileBlob) return jsonResponse({ error: downloadError?.message ?? "Invoice file could not be downloaded" }, 400);
  if (fileBlob.size > 15 * 1024 * 1024) return jsonResponse({ error: "Invoice is larger than the current 15 MB extraction limit." }, 413);

  const mime = invoice.mime_type || fileBlob.type || "application/octet-stream";
  const bytes = new Uint8Array(await fileBlob.arrayBuffer());
  const dataUrl = `data:${mime};base64,${encodeBase64(bytes)}`;

  const documentInput = mime === "application/pdf" || invoice.original_filename?.toLowerCase().endsWith(".pdf")
    ? { type: "input_file", filename: invoice.original_filename || "invoice.pdf", file_data: dataUrl }
    : { type: "input_image", image_url: dataUrl, detail: "high" };

  const prompt = [
    "Read this acquisition invoice for Calibre & Co.",
    "Extract only information actually visible in the document. Never invent missing values.",
    "Preserve each visible invoice/auction lot as one line. If a line is a mixed bundle or assorted lot, keep it as ONE line instead of inventing individual objects.",
    "Fees, buyer premium, tax and postage belong at invoice level unless the document clearly assigns them to a particular line.",
    "Use AUD only when the document indicates Australian dollars or no other currency is shown in an Australian invoice context; otherwise use the visible currency code/symbol interpretation and flag uncertainty in review_note.",
    "Create short proposed inventory titles, but put the exact visible description in raw_text.",
    "Choose type only from watch, clock, jewellery, accessory, other. Default purpose to resale unless the document itself supports something else.",
    "Confidence is confidence in the extracted line, from 0 to 1. Put ambiguities in review_note.",
  ].join("\n");

  const aiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          documentInput,
        ],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "calibre_invoice_extraction",
          strict: true,
          schema: invoiceSchema,
        },
      },
    }),
  });

  const aiJson = await aiResponse.json();
  if (!aiResponse.ok) {
    return jsonResponse({ error: aiJson?.error?.message ?? "Invoice extraction request failed" }, 502);
  }

  const text = outputText(aiJson);
  if (!text) return jsonResponse({ error: "Extractor returned no structured output" }, 502);

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonResponse({ error: "Extractor returned invalid JSON" }, 502);
  }

  const { error: updateError } = await supabase
    .from("acquisition_invoices")
    .update({
      vendor_name: parsed.vendor_name || "",
      invoice_number: parsed.invoice_number || "",
      invoice_date: parsed.invoice_date || null,
      currency: parsed.currency || "AUD",
      subtotal: parsed.subtotal ?? null,
      fees: parsed.fees ?? null,
      postage: parsed.postage ?? null,
      total: parsed.total ?? null,
      extraction_status: "needs_review",
      extraction_payload: parsed,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", invoice.workspace_id)
    .eq("id", invoice.id);

  if (updateError) return jsonResponse({ error: updateError.message }, 500);

  const { error: clearError } = await supabase
    .from("acquisition_invoice_lines")
    .delete()
    .eq("workspace_id", invoice.workspace_id)
    .eq("invoice_id", invoice.id);
  if (clearError) return jsonResponse({ error: clearError.message }, 500);

  const rows = (Array.isArray(parsed.lines) ? parsed.lines : []).map((line: any, index: number) => ({
    workspace_id: invoice.workspace_id,
    invoice_id: invoice.id,
    line_number: Number.isFinite(Number(line.line_number)) ? Number(line.line_number) : index + 1,
    lot_number: String(line.lot_number ?? ""),
    raw_text: String(line.raw_text ?? ""),
    proposed_title: String(line.title ?? line.raw_text ?? "").trim(),
    proposed_type: String(line.type ?? "other"),
    proposed_purpose: String(line.purpose ?? "resale"),
    quantity: Math.max(1, Number(line.quantity) || 1),
    unit_price: line.unit_price ?? null,
    line_total: line.line_total ?? null,
    confidence: line.confidence ?? null,
    include_on_import: true,
    review_note: String(line.review_note ?? ""),
  }));

  if (rows.length) {
    const { error: insertError } = await supabase.from("acquisition_invoice_lines").insert(rows);
    if (insertError) return jsonResponse({ error: insertError.message }, 500);
  }

  return jsonResponse({ ok: true, invoice_id: invoice.id, line_count: rows.length, status: "needs_review" });
});
