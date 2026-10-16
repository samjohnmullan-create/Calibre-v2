# Calibre v2

Calibre & Co. workshop, inventory, research and customer-record system.

## Production surfaces

- `calibreco.com.au` — customer-facing Calibre site: home, catalogue, archive, Watch Passports and Certificates.
- `app.calibreco.com.au` — intended workshop application hostname once the internal-app domain cutover is completed.

The same frontend build understands the customer hostname and renders only the public customer experience there. Customer-visible records are published through the dedicated `customer_publications` projection rather than exposing workshop tables directly.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run build
```

Pull requests run migration-integrity, critical-contract and production-build checks before merge.

## Customer publishing

Open `#/customer` in the authenticated workshop application to prepare a public record. The Publishing Studio can prefill verified Item/Passport facts, copy selected private workshop photos into the dedicated public media bucket, create certificate identifiers, preview Passports and Certificates, and explicitly publish or unpublish records.

Nothing appears publicly until `published` is enabled on its customer publication record.
