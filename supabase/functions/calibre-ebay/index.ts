import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "status" | "prepare" | "policies" | "verify" | "publish";
type ItemSpecific = { name: string; value: string };
type ListingInput = {
  title?: string;
  asking_price?: number | null;
  category_id?: string;
  condition_id?: string;
  payment_profile_id?: string;
  return_profile_id?: string;
  shipping_profile_id?: string;
  item_specifics?: ItemSpecific[];
};

type RequestBody = {
  action?: Action;
  item_id?: string;
  listing?: ListingInput;
};

type SourceRecord = {
  item: any;
  publication: any;
  identity: any;
  passport: any;
  existing: any;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return (Deno.env.get(name) ?? "").trim();
}

function ebayEnvironment() {
  return env("EBAY_ENVIRONMENT").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function ebayConfig() {
  const environment = ebayEnvironment();
  return {
    environment,
    clientId: env("EBAY_CLIENT_ID"),
    clientSecret: env("EBAY_CLIENT_SECRET"),
    refreshToken: env("EBAY_REFRESH_TOKEN"),
    postalCode: env("EBAY_POSTAL_CODE"),
    location: env("EBAY_LOCATION"),
    siteId: env("EBAY_SITE_ID") || "15",
    marketplaceId: env("EBAY_MARKETPLACE_ID") || "EBAY_AU",
    tradingVersion: env("EBAY_TRADING_API_VERSION") || "1487",
  };
}

function connectionStatus() {
  const config = ebayConfig();
  const credentials = Boolean(config.clientId && config.clientSecret && config.refreshToken);
  const location = Boolean(config.postalCode || config.location);
  return {
    environment: config.environment,
    marketplace_id: config.marketplaceId,
    site_id: config.siteId,
    credentials_configured: credentials,
    listing_location_configured: location,
    configured: credentials && location,
    missing: [
      !config.clientId ? "EBAY_CLIENT_ID" : "",
      !config.clientSecret ? "EBAY_CLIENT_SECRET" : "",
      !config.refreshToken ? "EBAY_REFRESH_TOKEN" : "",
      !location ? "EBAY_POSTAL_CODE or EBAY_LOCATION" : "",
    ].filter(Boolean),
  };
}

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compactText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function stripXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function xmlTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? stripXml(match[1].trim()) : "";
}

function xmlBlocks(xml: string, tag: string) {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi"))].map((match) => match[1]);
}

function parseTradingResponse(xml: string) {
  const errors = xmlBlocks(xml, "Errors").map((block) => ({
    code: xmlTag(block, "ErrorCode"),
    severity: xmlTag(block, "SeverityCode"),
    short_message: xmlTag(block, "ShortMessage"),
    long_message: xmlTag(block, "LongMessage"),
  }));
  const fees = xmlBlocks(xml, "Fee").map((block) => ({
    name: xmlTag(block, "Name"),
    amount: Number(xmlTag(block, "Fee")) || 0,
  })).filter((fee) => fee.name && fee.amount !== 0);
  const ack = xmlTag(xml, "Ack") || "Failure";
  return {
    ack,
    item_id: xmlTag(xml, "ItemID") || null,
    start_time: xmlTag(xml, "StartTime") || null,
    end_time: xmlTag(xml, "EndTime") || null,
    errors,
    fees,
  };
}

function titleFor(source: SourceRecord) {
  return compactText(source.publication?.public_title || source.item?.title || "Vintage watch").slice(0, 80);
}

function buildDescription(source: SourceRecord) {
  const publication = source.publication ?? {};
  const sections: string[] = [];
  const summary = compactText(publication.summary);
  if (summary) sections.push(`<p>${htmlEscape(summary)}</p>`);

  const labelled = [
    ["Condition", publication.condition_summary],
    ["Service", publication.service_summary],
    ["Provenance", publication.provenance_summary],
    ["Evidence & authenticity", publication.authenticity_note],
  ];
  for (const [label, value] of labelled) {
    const text = compactText(value);
    if (text) sections.push(`<h3>${htmlEscape(label)}</h3><p>${htmlEscape(text)}</p>`);
  }

  const facts = [
    ["Maker", publication.maker || source.identity?.maker],
    ["Model", publication.model || source.identity?.model],
    ["Reference", publication.reference || source.identity?.reference],
    ["Era", publication.era || source.identity?.era],
    ["Movement", [publication.movement_maker || source.passport?.movement_maker, publication.calibre || source.passport?.calibre].filter(Boolean).join(" ")],
    ["Jewels", publication.jewels ?? source.passport?.jewels],
    ["Movement type", publication.movement_type || source.passport?.movement_type],
    ["Case material", publication.case_material || source.passport?.case_material],
    ["Case width", publication.width_mm ? `${publication.width_mm} mm` : source.passport?.width_mm ? `${source.passport.width_mm} mm` : ""],
    ["Crystal", publication.crystal_type || source.passport?.crystal_type],
    ["Final timing", publication.final_timing_summary],
  ].filter(([, value]) => compactText(value));

  if (facts.length) {
    const rows = facts.map(([label, value]) => `<tr><th style="text-align:left;padding:4px 12px 4px 0">${htmlEscape(label)}</th><td style="padding:4px 0">${htmlEscape(value)}</td></tr>`).join("");
    sections.push(`<h3>Specifications</h3><table>${rows}</table>`);
  }

  sections.push("<p><strong>Calibre &amp; Co.</strong> — vintage watches researched and described from the evidence available to us.</p>");
  return sections.join("\n");
}

function inferredType(itemType: string) {
  const value = itemType.toLowerCase();
  if (value.includes("pocket")) return "Pocket Watch";
  if (value.includes("watch")) return "Wristwatch";
  return "";
}

function buildItemSpecifics(source: SourceRecord): ItemSpecific[] {
  const publication = source.publication ?? {};
  const identity = source.identity ?? {};
  const passport = source.passport ?? {};
  const values: ItemSpecific[] = [
    { name: "Brand", value: compactText(publication.maker || identity.maker) },
    { name: "Model", value: compactText(publication.model || identity.model) },
    { name: "Reference Number", value: compactText(publication.reference || identity.reference) },
    { name: "Type", value: inferredType(String(source.item?.type ?? "")) },
    { name: "Movement", value: compactText(publication.movement_type || passport.movement_type) },
    { name: "Case Material", value: compactText(publication.case_material || passport.case_material) },
    { name: "Country/Region of Manufacture", value: compactText(publication.country || identity.country) },
  ];
  return values.filter((entry) => entry.name && entry.value);
}

function buildDraft(source: SourceRecord) {
  const publication = source.publication ?? {};
  const existing = source.existing ?? {};
  const images = uniqueStrings([publication.hero_image_url, ...(Array.isArray(publication.gallery_urls) ? publication.gallery_urls : [])])
    .filter((url) => /^https:\/\//i.test(url))
    .slice(0, 12);
  const askingPrice = existing.asking_price ?? publication.price_amount ?? null;
  return {
    title: existing.title || titleFor(source),
    asking_price: askingPrice == null ? null : Number(askingPrice),
    currency: publication.currency || existing.currency || "AUD",
    category_id: existing.category_id || "",
    condition_id: existing.condition_id || "",
    payment_profile_id: existing.payment_profile_id || "",
    return_profile_id: existing.return_profile_id || "",
    shipping_profile_id: existing.shipping_profile_id || "",
    quantity: 1,
    listing_type: "FixedPriceItem",
    duration: "GTC",
    sku: `CAL-${source.item?.item_number ?? source.item?.id ?? "ITEM"}`,
    description_html: buildDescription(source),
    images,
    item_specifics: buildItemSpecifics(source),
  };
}

async function loadSource(supabase: any, itemId: string): Promise<SourceRecord> {
  const itemResult = await supabase
    .from("items")
    .select("id,workspace_id,item_number,title,type,status")
    .eq("id", itemId)
    .maybeSingle();
  if (itemResult.error || !itemResult.data) throw new Error(itemResult.error?.message || "Item not found");

  const item = itemResult.data;
  const workspaceId = item.workspace_id;
  const [publicationResult, identityResult, passportResult, existingResult] = await Promise.all([
    supabase.from("customer_publications").select("public_title,summary,condition_summary,service_summary,authenticity_note,provenance_summary,maker,model,reference,era,country,movement_maker,calibre,jewels,movement_type,case_material,width_mm,crystal_type,final_timing_summary,hero_image_url,gallery_urls,price_amount,currency").eq("workspace_id", workspaceId).eq("item_id", itemId).maybeSingle(),
    supabase.from("item_identity").select("maker,model,reference,era,country").eq("workspace_id", workspaceId).eq("item_id", itemId).maybeSingle(),
    supabase.from("passports").select("movement_maker,calibre,jewels,movement_type,case_material,width_mm,crystal_type").eq("workspace_id", workspaceId).eq("item_id", itemId).maybeSingle(),
    supabase.from("marketplace_listings").select("*").eq("workspace_id", workspaceId).eq("item_id", itemId).eq("provider", "ebay").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const error = publicationResult.error || identityResult.error || passportResult.error || existingResult.error;
  if (error) throw new Error(error.message);

  return {
    item,
    publication: publicationResult.data ?? null,
    identity: identityResult.data ?? null,
    passport: passportResult.data ?? null,
    existing: existingResult.data ?? null,
  };
}

async function accessToken() {
  const config = ebayConfig();
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error("eBay credentials are not configured on the server");
  }
  const endpoint = config.environment === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || "eBay access token refresh failed");
  }
  return String(payload.access_token);
}

async function loadPolicies(token: string) {
  const config = ebayConfig();
  const base = config.environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
    "Accept-Language": "en-AU",
    "X-EBAY-C-MARKETPLACE-ID": config.marketplaceId,
  };
  const paths = [
    ["fulfillment", `/sell/account/v1/fulfillment_policy?marketplace_id=${encodeURIComponent(config.marketplaceId)}`],
    ["payment", `/sell/account/v1/payment_policy?marketplace_id=${encodeURIComponent(config.marketplaceId)}`],
    ["return", `/sell/account/v1/return_policy?marketplace_id=${encodeURIComponent(config.marketplaceId)}`],
  ] as const;
  const results = await Promise.all(paths.map(async ([kind, path]) => {
    const response = await fetch(`${base}${path}`, { headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.errors?.[0]?.message || payload?.message || `${kind} policy lookup failed`;
      throw new Error(message);
    }
    return [kind, payload] as const;
  }));
  const payloads = Object.fromEntries(results) as Record<string, any>;
  return {
    fulfillment: (payloads.fulfillment?.fulfillmentPolicies ?? []).map((policy: any) => ({ id: String(policy.fulfillmentPolicyId), name: policy.name || policy.fulfillmentPolicyId })),
    payment: (payloads.payment?.paymentPolicies ?? []).map((policy: any) => ({ id: String(policy.paymentPolicyId), name: policy.name || policy.paymentPolicyId })),
    return: (payloads.return?.returnPolicies ?? []).map((policy: any) => ({ id: String(policy.returnPolicyId), name: policy.name || policy.returnPolicyId })),
  };
}

function mergeListing(draft: any, input: ListingInput | undefined) {
  const itemSpecifics = Array.isArray(input?.item_specifics)
    ? input!.item_specifics!.map((entry) => ({ name: compactText(entry?.name), value: compactText(entry?.value) })).filter((entry) => entry.name && entry.value)
    : draft.item_specifics;
  return {
    ...draft,
    title: compactText(input?.title || draft.title).slice(0, 80),
    asking_price: input?.asking_price == null ? draft.asking_price : Number(input.asking_price),
    category_id: compactText(input?.category_id || draft.category_id),
    condition_id: compactText(input?.condition_id || draft.condition_id),
    payment_profile_id: compactText(input?.payment_profile_id || draft.payment_profile_id),
    return_profile_id: compactText(input?.return_profile_id || draft.return_profile_id),
    shipping_profile_id: compactText(input?.shipping_profile_id || draft.shipping_profile_id),
    item_specifics: itemSpecifics,
  };
}

function listingMissing(listing: any) {
  const missing: string[] = [];
  if (!listing.title) missing.push("title");
  if (!(Number(listing.asking_price) > 0)) missing.push("asking price");
  if (!listing.category_id) missing.push("eBay category ID");
  if (!listing.condition_id) missing.push("condition ID");
  if (!listing.images?.length) missing.push("at least one public photo");
  if (!listing.payment_profile_id) missing.push("payment policy");
  if (!listing.return_profile_id) missing.push("return policy");
  if (!listing.shipping_profile_id) missing.push("shipping policy");
  return missing;
}

function buildTradingXml(callName: "VerifyAddFixedPriceItem" | "AddFixedPriceItem", listing: any) {
  const config = ebayConfig();
  const specifics = (listing.item_specifics ?? []).map((entry: ItemSpecific) => `
      <NameValueList><Name>${xmlEscape(entry.name)}</Name><Value>${xmlEscape(entry.value)}</Value></NameValueList>`).join("");
  const pictures = (listing.images ?? []).map((url: string) => `<PictureURL>${xmlEscape(url)}</PictureURL>`).join("");
  const locationXml = config.postalCode
    ? `<PostalCode>${xmlEscape(config.postalCode)}</PostalCode>`
    : `<Location>${xmlEscape(config.location)}</Location>`;

  return `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_AU</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Version>${xmlEscape(config.tradingVersion)}</Version>
  <Item>
    <Title>${xmlEscape(listing.title)}</Title>
    <Description>${xmlEscape(listing.description_html)}</Description>
    <PrimaryCategory><CategoryID>${xmlEscape(listing.category_id)}</CategoryID></PrimaryCategory>
    <StartPrice currencyID="AUD">${Number(listing.asking_price).toFixed(2)}</StartPrice>
    <ConditionID>${xmlEscape(listing.condition_id)}</ConditionID>
    <Country>AU</Country>
    <Currency>AUD</Currency>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    ${locationXml}
    <Quantity>1</Quantity>
    <SKU>${xmlEscape(listing.sku)}</SKU>
    <InventoryTrackingMethod>SKU</InventoryTrackingMethod>
    <PictureDetails>${pictures}</PictureDetails>
    <SellerProfiles>
      <SellerPaymentProfile><PaymentProfileID>${xmlEscape(listing.payment_profile_id)}</PaymentProfileID></SellerPaymentProfile>
      <SellerReturnProfile><ReturnProfileID>${xmlEscape(listing.return_profile_id)}</ReturnProfileID></SellerReturnProfile>
      <SellerShippingProfile><ShippingProfileID>${xmlEscape(listing.shipping_profile_id)}</ShippingProfileID></SellerShippingProfile>
    </SellerProfiles>
    <ItemSpecifics>${specifics}</ItemSpecifics>
  </Item>
</${callName}Request>`;
}

async function tradingCall(callName: "VerifyAddFixedPriceItem" | "AddFixedPriceItem", listing: any, token: string) {
  const config = ebayConfig();
  const endpoint = config.environment === "sandbox" ? "https://api.sandbox.ebay.com/ws/api.dll" : "https://api.ebay.com/ws/api.dll";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-COMPATIBILITY-LEVEL": config.tradingVersion,
      "X-EBAY-API-SITEID": config.siteId,
      "X-EBAY-API-IAF-TOKEN": token,
    },
    body: buildTradingXml(callName, listing),
  });
  const raw = await response.text();
  const parsed = parseTradingResponse(raw);
  if (!response.ok && !parsed.errors.length) {
    parsed.errors.push({ code: String(response.status), severity: "Error", short_message: response.statusText, long_message: "eBay Trading API request failed" });
  }
  return { http_status: response.status, ...parsed };
}

async function saveMarketplaceResult(supabase: any, source: SourceRecord, listing: any, result: any, status: string) {
  const now = new Date().toISOString();
  const payload: any = {
    workspace_id: source.item.workspace_id,
    item_id: source.item.id,
    provider: "ebay",
    environment: ebayEnvironment(),
    status,
    title: listing.title,
    asking_price: listing.asking_price,
    currency: "AUD",
    category_id: listing.category_id,
    condition_id: listing.condition_id,
    quantity: 1,
    listing_type: "FixedPriceItem",
    duration: "GTC",
    payment_profile_id: listing.payment_profile_id,
    return_profile_id: listing.return_profile_id,
    shipping_profile_id: listing.shipping_profile_id,
    verification: status === "verified" ? result : (source.existing?.verification ?? {}),
    provider_snapshot: result,
    updated_at: now,
    last_synced_at: now,
  };
  if (status === "verified") payload.verified_at = now;
  if (status === "live") {
    payload.external_listing_id = result.item_id;
    payload.published_at = now;
    payload.listing_url = ebayEnvironment() === "sandbox"
      ? `https://www.sandbox.ebay.com/itm/${encodeURIComponent(result.item_id)}`
      : `https://www.ebay.com.au/itm/${encodeURIComponent(result.item_id)}`;
  }

  const existingId = source.existing?.id;
  const write = existingId
    ? await supabase.from("marketplace_listings").update(payload).eq("id", existingId).select("*").single()
    : await supabase.from("marketplace_listings").insert(payload).select("*").single();
  if (write.error) throw new Error(`Marketplace result could not be saved: ${write.error.message}`);
  return write.data;
}

async function recordPublishedSale(supabase: any, source: SourceRecord, listing: any, marketplace: any) {
  const now = new Date().toISOString();
  const latestSale = await supabase.from("sales").select("id,status").eq("workspace_id", source.item.workspace_id).eq("item_id", source.item.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latestSale.error) throw new Error(latestSale.error.message);
  const salePayload = {
    workspace_id: source.item.workspace_id,
    item_id: source.item.id,
    status: "listed",
    channel: "ebay",
    listing_title: listing.title,
    listing_text: listing.description_html,
    asking_price: Number(listing.asking_price),
    currency: "AUD",
    listed_at: now,
    updated_at: now,
  };
  const saleWrite = latestSale.data && latestSale.data.status !== "sold"
    ? await supabase.from("sales").update(salePayload).eq("id", latestSale.data.id).select("id").single()
    : await supabase.from("sales").insert(salePayload).select("id").single();
  if (saleWrite.error) throw new Error(`eBay listing is live, but the Calibre Sale record could not be saved: ${saleWrite.error.message}`);

  const marketplaceWrite = await supabase.from("marketplace_listings").update({ sale_id: saleWrite.data.id, updated_at: now }).eq("id", marketplace.id);
  if (marketplaceWrite.error) throw new Error(`Sale was saved, but marketplace linkage failed: ${marketplaceWrite.error.message}`);

  const itemWrite = await supabase.from("items").update({ status: "listed", updated_at: now }).eq("workspace_id", source.item.workspace_id).eq("id", source.item.id);
  if (itemWrite.error) throw new Error(`Sale was saved, but Item status could not be updated: ${itemWrite.error.message}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Authentication required" }, 401);

  let body: RequestBody;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const action: Action = body.action || "prepare";

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (action === "status") return json({ ok: true, connection: connectionStatus() });

    if (action === "policies") {
      const token = await accessToken();
      const policies = await loadPolicies(token);
      return json({ ok: true, connection: connectionStatus(), policies });
    }

    if (!body.item_id) return json({ error: "item_id is required" }, 400);
    const source = await loadSource(supabase, body.item_id);
    const prepared = buildDraft(source);

    if (action === "prepare") {
      const missing = [] as string[];
      if (!source.publication) missing.push("saved customer publication draft");
      if (!prepared.images.length) missing.push("public photo");
      if (!(Number(prepared.asking_price) > 0)) missing.push("asking price");
      return json({
        ok: true,
        connection: connectionStatus(),
        item: source.item,
        draft: prepared,
        existing: source.existing,
        missing,
      });
    }

    const listing = mergeListing(prepared, body.listing);
    const missing = listingMissing(listing);
    const status = connectionStatus();
    if (!status.configured) return json({ error: "eBay server connection is not fully configured", connection: status }, 503);
    if (missing.length) return json({ error: `Listing is incomplete: ${missing.join(", ")}`, missing, draft: listing }, 400);

    const token = await accessToken();
    const callName = action === "publish" ? "AddFixedPriceItem" : "VerifyAddFixedPriceItem";
    const result = await tradingCall(callName, listing, token);
    const hasError = result.errors.some((entry: any) => String(entry.severity).toLowerCase() === "error");
    const acknowledged = ["success", "warning"].includes(String(result.ack).toLowerCase());

    if (hasError || !acknowledged || (action === "publish" && !result.item_id)) {
      const marketplace = await saveMarketplaceResult(supabase, source, listing, result, "error");
      return json({ ok: false, action, result, marketplace }, 422);
    }

    const marketplace = await saveMarketplaceResult(supabase, source, listing, result, action === "publish" ? "live" : "verified");
    if (action === "publish") await recordPublishedSale(supabase, source, listing, marketplace);

    return json({ ok: true, action, result, marketplace });
  } catch (error) {
    console.error("calibre-ebay", error);
    return json({ error: error instanceof Error ? error.message : "eBay integration failed" }, 500);
  }
});
