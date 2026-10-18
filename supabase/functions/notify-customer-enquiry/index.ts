import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  let body: { enquiry_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!body.enquiry_id) return json({ error: "enquiry_id is required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const service = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: enquiry, error: enquiryError } = await service
    .from("customer_enquiries")
    .select("id,publication_id,name,email,phone,message,source_url,status,notification_sent_at,customer_publications!inner(workspace_id,public_title,slug,availability)")
    .eq("id", body.enquiry_id)
    .maybeSingle();

  if (enquiryError) return json({ error: enquiryError.message }, 500);
  if (!enquiry) return json({ error: "Enquiry not found" }, 404);
  if (enquiry.notification_sent_at) return json({ ok: true, already_sent: true });

  const publication: any = Array.isArray((enquiry as any).customer_publications)
    ? (enquiry as any).customer_publications[0]
    : (enquiry as any).customer_publications;
  const workspaceId = String(publication?.workspace_id ?? "");
  if (!workspaceId) return json({ error: "Publication workspace not found" }, 409);

  const { data: settings, error: settingsError } = await service
    .from("customer_notification_settings")
    .select("email_enabled,email_to")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (settingsError) return json({ error: settingsError.message }, 500);
  if (!settings?.email_enabled) return json({ ok: true, skipped: "email_disabled" });
  if (!settings.email_to) return json({ error: "Notification recipient is not configured" }, 409);

  const { data: resendKey, error: secretError } = await service.rpc("get_calibre_server_secret", { p_name: "resend_enquiry_api_key" });
  if (secretError || !resendKey) return json({ error: secretError?.message ?? "Resend key unavailable" }, 503);

  const watch = String(publication?.public_title || "Published watch");
  const passportUrl = publication?.slug ? `https://calibreco.com.au/#/passport/${encodeURIComponent(String(publication.slug))}` : "https://calibreco.com.au/#/catalogue";
  const text = [
    `New customer enquiry: ${watch}`,
    "",
    `From: ${enquiry.name} <${enquiry.email}>`,
    enquiry.phone ? `Phone: ${enquiry.phone}` : "",
    "",
    String(enquiry.message ?? ""),
    "",
    `Passport: ${passportUrl}`,
    `Open in Calibre: https://app.calibreco.com.au/#/customer/enquiries`,
  ].filter(Boolean).join("\n");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"></head><body style="margin:0;background-color:#f4f1ea;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td align="center" style="padding-top:28px;padding-right:16px;padding-bottom:28px;padding-left:16px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;background-color:#ffffff;border-radius:14px;"><tr><td style="padding-top:28px;padding-right:28px;padding-bottom:12px;padding-left:28px;font-size:12px;line-height:18px;color:#6b6f72;letter-spacing:1.4px;">CALIBRE &amp; CO. · NEW ENQUIRY</td></tr><tr><td style="padding-top:0;padding-right:28px;padding-bottom:10px;padding-left:28px;font-size:26px;line-height:34px;color:#172026;font-weight:700;">${esc(watch)}</td></tr><tr><td style="padding-top:0;padding-right:28px;padding-bottom:18px;padding-left:28px;font-size:15px;line-height:23px;color:#3d454a;"><strong>${esc(enquiry.name)}</strong><br>${esc(enquiry.email)}${enquiry.phone ? `<br>${esc(enquiry.phone)}` : ""}</td></tr><tr><td style="padding-top:0;padding-right:28px;padding-bottom:24px;padding-left:28px;font-size:16px;line-height:25px;color:#172026;white-space:pre-wrap;">${esc(enquiry.message)}</td></tr><tr><td style="padding-top:0;padding-right:28px;padding-bottom:28px;padding-left:28px;"><table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td bgcolor="#172026" style="background-color:#172026;border-radius:8px;"><a href="https://app.calibreco.com.au/#/customer/enquiries" style="display:inline-block;padding-top:12px;padding-right:18px;padding-bottom:12px;padding-left:18px;font-size:14px;line-height:20px;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Open in Calibre</a></td><td style="padding-left:12px;font-size:14px;line-height:20px;color:#3d454a;"><a href="${esc(passportUrl)}" style="color:#3d454a;text-decoration:underline;">View Passport</a></td></tr></table></td></tr></table></td></tr></table></body></html>`;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(resendKey)}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `calibre-enquiry-${enquiry.id}`,
    },
    body: JSON.stringify({
      from: "Calibre & Co. <enquiries@calibreco.com.au>",
      to: [settings.email_to],
      reply_to: enquiry.email,
      subject: `New enquiry · ${watch}`,
      text,
      html,
      tags: [
        { name: "type", value: "customer-enquiry" },
        { name: "enquiry_id", value: String(enquiry.id).replaceAll("-", "_") },
      ],
    }),
  });

  const resendJson = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) {
    const reason = String((resendJson as any)?.message ?? "Resend delivery failed").slice(0, 1000);
    await service.from("customer_enquiries").update({ notification_error: reason }).eq("id", enquiry.id);
    return json({ error: reason }, 502);
  }

  const sentAt = new Date().toISOString();
  await service.from("customer_enquiries").update({ notification_sent_at: sentAt, notification_error: null }).eq("id", enquiry.id);
  return json({ ok: true, sent_at: sentAt, email_id: (resendJson as any)?.id ?? null });
});