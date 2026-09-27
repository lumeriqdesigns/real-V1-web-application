# WhatsApp CRM V1 — real web application

This is the production foundation for the CRM: Next.js + Supabase authentication/database, designed for Vercel deployment.

## What is live in V1.1
- Email/password authentication
- Protected dashboard
- Contacts stored in PostgreSQL/Supabase
- CSV/Excel/VCF drag-and-drop contact import with preview, Nigerian phone normalization and duplicate detection
- Marketing opt-in fields and timestamps
- Tags
- Campaign drafts and recipient counts
- Message template library
- Activity history
- WhatsApp Business Platform connection test
- Secure row-level security so users only see their own records

## Setup
1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. In Supabase Authentication settings, configure email/password. For easiest first test, email confirmation can be disabled temporarily; re-enable it for production.
4. Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable key.
5. Run `npm install` then `npm run dev`.
6. Open the local URL, create an account, and add contacts.

## Vercel
Import this folder/repository into Vercel and add the same two environment variables. No WhatsApp access token belongs in `NEXT_PUBLIC_*` variables.

## WhatsApp Business Platform
The dashboard now includes a WhatsApp connection screen and a server-side connection test. Add the WHATSAPP_* variables from `.env.example` to Vercel; never put the Meta access token in a `NEXT_PUBLIC_*` variable. The next implementation stage can add approved-template sending, campaign queues, inbound webhooks and delivery/read status.

## Contact import upgrade

The CRM now supports drag-and-drop contact imports for CSV, Excel (`.xlsx`/`.xls`) and VCF/vCard (`.vcf`/`.vcard`) files. It previews detected contacts, normalizes Nigerian phone numbers, excludes duplicates already in the CRM and incomplete rows, and only writes contacts to Supabase after confirmation.

The Excel reader uses the `xlsx` package. No WhatsApp scraping is performed.
