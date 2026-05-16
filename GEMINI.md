# Hostelrr Project Instructions

This document outlines the architecture, conventions, and workflows for the Hostelrr project.

## 🏗 Architecture

- **Backend-as-a-Service:** Supabase (Auth, Postgres, Storage, Edge Functions).
- **Frontend:** React (TypeScript) with Vite.
- **Business Logic:** Centralized in **Postgres RPCs** (Stored Procedures) to ensure security (Security Definer) and data integrity across all clients.
- **State Management:** React Context (`AppContext.tsx`) for global data loading and caching.
- **Data Access:** All database interactions must be wrapped in `src/lib/supabaseAPI.ts`.

## 🛠 Conventions

### Database & Migrations
- **Source of Truth:** The database schema and enums are the source of truth.
- **Migrations:** New changes must be added as sequential SQL migrations in `supabase/migrations/`.
- **Soft Deletes:** Use `archive_resident` instead of hard deletes for residents to preserve financial history.
- **RLS:** Row Level Security is enforced on all tables. Policies should be security-focused, while business filtering is handled in RPCs.

### Frontend
- **API Calls:** Never call `supabase.from()` directly in components. Add a wrapper function in `src/lib/supabaseAPI.ts`.
- **Styling:** Tailwind CSS (configured via `@tailwindcss/vite`).
- **Icons:** Lucide React.
- **Toasts:** Sonner for user feedback.

### Financial Integrity
- **Payment Ledger:** Every payment modification must be logged via the `payment_ledger` table (see migration 047).
- **Monthly Summaries:** Historical reporting relies on the `monthly_rent_summaries` table. Refresh it after significant payment updates using the `refresh_monthly_summaries` RPC.

## 🔄 Workflows

### Adding a New RPC
1. Create a new migration file in `supabase/migrations/`.
2. Implement the function with `SECURITY DEFINER` and appropriate error handling.
3. Add a wrapper in `src/lib/supabaseAPI.ts`.
4. Call the wrapper from `AppContext.tsx` or directly in components if localized.

### Handling File Uploads
- Use the `hostelrr-documents` bucket.
- Paths follow the pattern: `{type}/{hostel_id}/{category}/{filename}`.
- Always use `getSignedFileUrl` from `supabaseAPI.ts` to retrieve files for display.
