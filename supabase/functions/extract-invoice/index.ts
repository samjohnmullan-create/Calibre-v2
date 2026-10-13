import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableInteger = { anyOf: [{ type: "integer" }, { type: "null" }] };

const attributeProperties = {
  maker: nullableString, model: nullableString, reference: nullableString, serial: nullableString,
  year: nullableInteger, era: nullableString, country: nullableString, materials: nullableString,
  dimensions_text: nullableString, weight_grams: nullableNumber,
  dial_markings: nullableString, case_markings: nullableString, movement_markings: nullableString,
  movement_maker: nullableString, calibre: nullableString, calibre_family: nullableString,
  jewels: nullableInteger, beat_rate: nullableInteger, power_reserve_hours: nullableNumber,
  escapement: nullableString, movement_diameter_mm: nullableNumber, movement_type: nullableString,
  setting_system: nullableString, complications: { type: "array", items: { type: "string" } },
  case_material: nullableString, case_style: nullableString, caseback_type: nullableString,
  crystal_type: nullableString, crown_type: nullableString, lug_width_mm: nullableNumber,
  width_mm: nullableNumber, height_mm: nullableNumber, thickness_mm: nullableNumber,
  water_resistance_marking: nullableString, hallmarks: nullableString,
  condition: nullableString, working_status: nullableString, technical_notes: nullableString,
  extra_facts: {
    type: "array",
    items: {
      type: "object", additionalProperties: false,
      properties: { key: { type: "string" }, value: { type: "string" } },
      required: ["key", "value"],
    },
  },
};

const invoiceSchema = {
  type: "object", additionalProperties: false,
  properties: {
    vendor_name: { type: "string" }, invoice_number: { type: "string" }, invoice_date: nullableString,
    currency: { type: "string" }, subtotal: nullableNumber, fees: nullableNumber, postage: nullableNumber, total: nullableNumber,
    lines: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          line_number: nullableInteger, lot_number: { type: "string" }, raw_text: { type: "string" },
          title: { type: "string" }, type: { type: "string", enum: ["watch", "clock", "jewellery", "accessory", "other"] },
          purpose: { type: "string", enum: ["resale", "collection", "repair", "donor", "client", "reference", "other"] },
          quantity: { type: "integer", minimum: 1 }, unit_price: nullableNumber, line_total: nullableNumber,
          confidence: { anyOf: [{ type: "number", minimum: 0, maximum: 1 }, { type: "null" }] },
          review_note: { type: "string" },
          attributes: { type: "object", additionalProperties: false, properties: attributeProperties, required: Object.keys(attributeProperties) },
        },
        required: ["line_number","lot_number","raw_text","title","type","purpose","quantity","unit_price","line_total","confidence","review_note","attributes"],
      },
    },
  },
  required: ["vendor_name","invoice_number","invoice_date","currency","subtotal","fees","postage","total","lines"],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function outputText(response: any): string {
  for (const item of response?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content ?? []) if (content?.type === "output_text" && typeof content?.text === "string") return content.text;
  }
  return "";
}

function normalizeInvoiceDate(value: unknown, currency: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parts = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!parts) return null;
  const a = Number(parts[1]), b = Number(parts[2]), year = Number(parts[3]);
  let day: number, month: number;
  if (a > 12) { day = a; month = b; }
  else if (b > 12) { month = a; day = b; }
  else if (new Set(["GBP","AUD","NZD","EUR"]).has(currency.toUpperCase())) { day = a; month = b; }
  else { month = a; day = b; }
  const candidate = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  return Number.isNaN(new Date(`${candidate}T00:00:00Z`).getTime()) ? null : candidate;
}

function roundMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round((numeric + Number.EPSILON) * 100) / 100 : null;
}

async function getAudRate(currency: string, invoiceDate: string | null) {
  const code = currency.toUpperCase();
  if (code === "AUD") return { rate: 1, date: invoiceDate, warning: "" };
  if (!/^[A-Z]{3}$/.test(code)) return { rate: null, date: null, warning: `Unsupported currency code: ${currency}` };
  if (!invoiceDate) return { rate: null, date: null, warning: "No reliable invoice date was available for historical AUD conversion." };
  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/${encodeURIComponent(code)}/AUD?date=${encodeURIComponent(invoiceDate)}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return { rate: null, date: null, warning: `AUD exchange-rate lookup failed (${response.status}).` };
    const payload = await response.json();
    const rate = Number(payload?.rate);
    if (!Number.isFinite(rate) || rate <= 0) return { rate: null, date: null, warning: "AUD exchange-rate lookup returned no usable rate." };
    return { rate, date: typeof payload?.date === "string" ? payload.date : invoiceDate, warning: "" };
  } catch (error) {
    return { rate: null, date: null, warning: `AUD exchange-rate lookup failed: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const openAiKey = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();
  const model = Deno.env.get("OPENAI_INVOICE_MODEL") || "gpt-4o-mini";
  if (!openAiKey) return jsonResponse({ error: "Invoice extractor is not configured yet. Add OPENAI_API_KEY to Supabase Edge Function secrets." }, 503);

  let body: { invoice_id?: string };
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }
  if (!body.invoice_id) return jsonResponse({ error: "invoice_id is required" }, 400);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: invoice, error: invoiceError } = await supabase.from("acquisition_invoices")
    .select("id,workspace_id,original_filename,mime_type,storage_path").eq("id", body.invoice_id).single();
  if (invoiceError || !invoice) return jsonResponse({ error: invoiceError?.message ?? "Invoice not found" }, 404);

  const { data: importedLine, error: importedLineError } = await supabase.from("acquisition_invoice_lines")
    .select("id").eq("workspace_id", invoice.workspace_id).eq("invoice_id", invoice.id).not("created_item_id", "is", null).limit(1).maybeSingle();
  if (importedLineError) return jsonResponse({ error: importedLineError.message }, 500);
  if (importedLine) return jsonResponse({ error: "This invoice already has imported Items, so it cannot be read again. Upload a new copy if you need a fresh extraction." }, 409);

  const { data: fileBlob, error: downloadError } = await supabase.storage.from("calibre-media").download(invoice.storage_path);
  if (downloadError || !fileBlob) return jsonResponse({ error: downloadError?.message ?? "Invoice file could not be downloaded" }, 400);
  if (fileBlob.size > 15 * 1024 * 1024) return jsonResponse({ error: "Invoice is larger than the current 15 MB extraction limit." }, 413);

  const mime = invoice.mime_type || fileBlob.type || "application/octet-stream";
  const dataUrl = `data:${mime};base64,${encodeBase64(new Uint8Array(await fileBlob.arrayBuffer()))}`;
  const documentInput = mime === "application/pdf" || invoice.original_filename?.toLowerCase().endsWith(".pdf")
    ? { type: "input_file", filename: invoice.original_filename || "invoice.pdf", file_data: dataUrl }
    : { type: "input_image", image_url: dataUrl, detail: "high" };

  const prompt = [
    "Read this acquisition invoice for Calibre & Co.",
    "Extract only information actually visible in the document. Never invent missing values.",
    "Return invoice_date as ISO YYYY-MM-DD. Resolve ambiguous numeric dates using vendor/location/currency context. UK and Australian documents are day-month-year unless clearly indicated otherwise.",
    "Keep each visible invoice/auction lot as one line. Mixed bundles remain one line.",
    "Fees, buyer premium, tax and postage belong at invoice level unless clearly assigned to a line.",
    "Use the visible invoice currency. Do not convert it; Calibre converts to AUD separately.",
    "For EVERY line, populate attributes with every useful item detail visible in the document: maker/brand, model, reference, serial, year/era, country, material, dimensions, weight, markings, movement/calibre/jewels, case/crystal/crown details, complications, condition, working status and any other facts.",
    "If a known attribute is not visible, return null (or [] for complications/extra_facts). Put unusual details that do not fit a named field into extra_facts as key/value pairs.",
    "Do not infer technical specifications merely from a brand/model name. Attributes must come from visible invoice text.",
    "Create short inventory titles but preserve exact visible description in raw_text.",
    "Default purpose to resale unless the document itself supports something else.",
    "Confidence is confidence in the extracted line from 0 to 1. Put ambiguities in review_note.",
  ].join("\n");

  const aiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, documentInput] }],
      text: { format: { type: "json_schema", name: "calibre_invoice_extraction", strict: true, schema: invoiceSchema } },
    }),
  });

  const aiJson = await aiResponse.json();
  if (!aiResponse.ok) return jsonResponse({ error: aiJson?.error?.message ?? "Invoice extraction request failed" }, 502);
  const text = outputText(aiJson);
  if (!text) return jsonResponse({ error: "Extractor returned no structured output" }, 502);
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { return jsonResponse({ error: "Extractor returned invalid JSON" }, 502); }

  const currency = String(parsed.currency || "AUD").trim().toUpperCase();
  const invoiceDate = normalizeInvoiceDate(parsed.invoice_date, currency);
  const fx = await getAudRate(currency, invoiceDate);
  const toAud = (value: unknown) => { const original = roundMoney(value); return original == null || fx.rate == null ? null : roundMoney(original * fx.rate); };

  const extractionPayload = { ...parsed, invoice_date: invoiceDate, currency, aud_conversion: { target_currency: "AUD", rate: fx.rate, rate_date: fx.date, source: currency === "AUD" ? "identity" : "Frankfurter v2 public API", warning: fx.warning } };

  const { error: updateError } = await supabase.from("acquisition_invoices").update({
    vendor_name: parsed.vendor_name || "", invoice_number: parsed.invoice_number || "", invoice_date: invoiceDate, currency,
    subtotal: roundMoney(parsed.subtotal), fees: roundMoney(parsed.fees), postage: roundMoney(parsed.postage), total: roundMoney(parsed.total),
    exchange_rate_to_aud: fx.rate, exchange_rate_date: fx.date,
    subtotal_aud: toAud(parsed.subtotal), fees_aud: toAud(parsed.fees), postage_aud: toAud(parsed.postage), total_aud: toAud(parsed.total),
    extraction_status: "needs_review", extraction_payload: extractionPayload, updated_at: new Date().toISOString(),
  }).eq("workspace_id", invoice.workspace_id).eq("id", invoice.id);
  if (updateError) return jsonResponse({ error: updateError.message }, 500);

  const { error: clearError } = await supabase.from("acquisition_invoice_lines").delete().eq("workspace_id", invoice.workspace_id).eq("invoice_id", invoice.id);
  if (clearError) return jsonResponse({ error: clearError.message }, 500);

  const rows = (Array.isArray(parsed.lines) ? parsed.lines : []).map((line: any, index: number) => ({
    workspace_id: invoice.workspace_id, invoice_id: invoice.id,
    line_number: Number.isFinite(Number(line.line_number)) ? Number(line.line_number) : index + 1,
    lot_number: String(line.lot_number ?? ""), raw_text: String(line.raw_text ?? ""),
    proposed_title: String(line.title ?? line.raw_text ?? "").trim(), proposed_type: String(line.type ?? "other"), proposed_purpose: String(line.purpose ?? "resale"),
    quantity: Math.max(1, Number(line.quantity) || 1), unit_price: roundMoney(line.unit_price), line_total: roundMoney(line.line_total),
    unit_price_aud: toAud(line.unit_price), line_total_aud: toAud(line.line_total), confidence: line.confidence ?? null,
    include_on_import: true, review_note: [String(line.review_note ?? "").trim(), fx.warning].filter(Boolean).join(" "),
    attributes: line.attributes && typeof line.attributes === "object" ? line.attributes : {},
  }));

  if (rows.length) {
    const { error: insertError } = await supabase.from("acquisition_invoice_lines").insert(rows);
    if (insertError) return jsonResponse({ error: insertError.message }, 500);
  }

  return jsonResponse({ ok: true, invoice_id: invoice.id, line_count: rows.length, status: "needs_review", currency, aud_rate: fx.rate, aud_rate_date: fx.date, aud_warning: fx.warning });
});
