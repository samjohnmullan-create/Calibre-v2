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

function normalizeInvoiceDate(value: unknown, currency: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;

  const parts = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!parts) return null;
  const a = Number(parts[1]);
  const b = Number(parts[2]);
  const year = Number(parts[3]);
  let day: number;
  let month: number;

  if (a > 12) {
    day = a; month = b;
  } else if (b > 12) {
    month = a; day = b;
  } else {
    const dayFirstCurrencies = new Set(["GBP", "AUD", "NZD", "EUR"]);
    if (dayFirstCurrencies.has(currency.toUpperCase())) {
      day = a; month = b;
    } else {
      month = a; day = b;
    }
  }

  const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : candidate;
}

function roundMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

async function getAudRate(currency: string, invoiceDate: string | null): Promise<{ rate: number | null; date: string | null; warning: string }> {
  const code = currency.toUpperCase();
  if (code === "AUD") return { rate: 1, date: invoiceDate, warning: "" };
  if (!/^[A-Z]{3}$/.test(code)) return { rate: null, date: null, warning: `Unsupported currency code: ${currency}` };
  if (!invoiceDate) return { rate: null, date: null, warning: "No reliable invoice date was available for historical AUD conversion." };

  try {
    const url = `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(code)}/AUD?date=${encodeURIComponent(invoiceDate)}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
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

  const { data: importedLine, error: importedLineError } = await supabase
    .from("acquisition_invoice_lines")
    .select("id")
    .eq("workspace_id", invoice.workspace_id)
    .eq("invoice_id", invoice.id)
    .not("created_item_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (importedLineError) return jsonResponse({ error: importedLineError.message }, 500);
  if (importedLine) return jsonResponse({ error: "This invoice already has imported Items, so it cannot be read again. Upload a new copy if you need a fresh extraction." }, 409);

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
    "Return invoice_date as ISO YYYY-MM-DD. Resolve ambiguous numeric dates using the vendor/location/currency context shown on the invoice. For UK and Australian documents use day-month-year unless the document clearly indicates otherwise.",
    "Preserve each visible invoice/auction lot as one line. If a line is a mixed bundle or assorted lot, keep it as ONE line instead of inventing individual objects.",
    "Fees, buyer premium, tax and postage belong at invoice level unless the document clearly assigns them to a particular line.",
    "Use the actual visible invoice currency. Do not convert currencies yourself; Calibre performs a separate auditable AUD conversion after extraction.",
    "Create short proposed inventory titles, but put the exact visible description in raw_text.",
    "Choose type only from watch, clock, jewellery, accessory, other. Default purpose to resale unless the document itself supports something else.",
    "Confidence is confidence in the extracted line, from 0 to 1. Put ambiguities in review_note.",
  ].join("\n");

  const aiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey.trim()}`,
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

  const currency = String(parsed.currency || "AUD").trim().toUpperCase();
  const invoiceDate = normalizeInvoiceDate(parsed.invoice_date, currency);
  const fx = await getAudRate(currency, invoiceDate);
  const toAud = (value: unknown) => {
    const original = roundMoney(value);
    return original == null || fx.rate == null ? null : roundMoney(original * fx.rate);
  };

  const extractionPayload = {
    ...parsed,
    invoice_date: invoiceDate,
    currency,
    aud_conversion: {
      target_currency: "AUD",
      rate: fx.rate,
      rate_date: fx.date,
      source: currency === "AUD" ? "identity" : "Frankfurter v2 public API",
      warning: fx.warning,
    },
  };

  const { error: updateError } = await supabase
    .from("acquisition_invoices")
    .update({
      vendor_name: parsed.vendor_name || "",
      invoice_number: parsed.invoice_number || "",
      invoice_date: invoiceDate,
      currency,
      subtotal: roundMoney(parsed.subtotal),
      fees: roundMoney(parsed.fees),
      postage: roundMoney(parsed.postage),
      total: roundMoney(parsed.total),
      exchange_rate_to_aud: fx.rate,
      exchange_rate_date: fx.date,
      subtotal_aud: toAud(parsed.subtotal),
      fees_aud: toAud(parsed.fees),
      postage_aud: toAud(parsed.postage),
      total_aud: toAud(parsed.total),
      extraction_status: "needs_review",
      extraction_payload: extractionPayload,
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
    unit_price: roundMoney(line.unit_price),
    line_total: roundMoney(line.line_total),
    unit_price_aud: toAud(line.unit_price),
    line_total_aud: toAud(line.line_total),
    confidence: line.confidence ?? null,
    include_on_import: true,
    review_note: [String(line.review_note ?? "").trim(), fx.warning].filter(Boolean).join(" "),
  }));

  if (rows.length) {
    const { error: insertError } = await supabase.from("acquisition_invoice_lines").insert(rows);
    if (insertError) return jsonResponse({ error: insertError.message }, 500);
  }

  return jsonResponse({
    ok: true,
    invoice_id: invoice.id,
    line_count: rows.length,
    status: "needs_review",
    currency,
    aud_rate: fx.rate,
    aud_rate_date: fx.date,
    aud_warning: fx.warning,
  });
});
