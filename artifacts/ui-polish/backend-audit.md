# Backend audit — 2026-11-11

Project: `gzdnleabzyxrqfbiwkhu` (production). No database writes, deployment, or reset were performed.

| Check | Result | Evidence |
| --- | --- | --- |
| Cloud `public.store_settings`, key `main` | PASS | Public REST returned one row with pickup 10:00–20:00 and delivery 10:00–19:00 for all seven days. |
| Public access to approval columns | EXPECTED_DENIAL | A public REST request including approval fields returned 401 because column-level grants exclude them; a request using granted columns returned 200. This 401 is not evidence of a missing row. |
| Local `public.store_settings`, key `main` | PASS | Local REST at `127.0.0.1:54321` returned the same non-null hours. |
| `delivery-verify` | PASS_DEPLOYED | Supabase CLI reports ACTIVE version 2; unauthenticated POST returns `AUTH_REQUIRED`. |
| Other Edge Functions | PASS_DEPLOYED | CLI reports ACTIVE: `product-search`, `related-products`, `churn-research`, `vnpay-gateway`, `cake-preview`. |
| Geoapify configuration | BLOCKED_CONFIG | CLI secret inventory has no `BOBOT_GEOAPIFY_API_KEY`; the function reads precisely that name in both geocode and place detail paths. `BOBOT_NOMINATIM_CONTACT_URL` is absent too. |
| Delivery origin approval | BLOCKED_VERIFICATION | Approval fields are not granted to the public role. No customer token or privileged SQL connection was used. |
| Pickup-hours warning previously seen in UI | NOT_REPRODUCED | Both current store rows have pickup hours. A historical warning or an authenticated quote request cannot be diagnosed from the current public row alone. |

The owner can put a Geoapify key in a private `.env` file outside the repo containing only `BOBOT_GEOAPIFY_API_KEY=<key>`, then run:

```powershell
node_modules/.bin/supabase.cmd secrets set --env-file C:\secure\bobot-geoapify.env --remote=gzdnleabzyxrqfbiwkhu
node_modules/.bin/supabase.cmd secrets list --remote=gzdnleabzyxrqfbiwkhu
```

Run this read-only SQL in the Supabase SQL editor to check the remaining delivery gate:

```sql
select store_key, pickup_hours, delivery_hours, bakery_lat, bakery_lng,
       delivery_origin_approved_at, delivery_origin_approval_source
from public.store_settings
where store_key = 'main';
```

If the approved origin fields are empty and the owner confirms the approved coordinates from `reference/production/store-approval.json`, this targeted SQL can fill them without changing hours or resetting data:

```sql
update public.store_settings
set delivery_origin_approved_at = now(),
    delivery_origin_approval_source = 'BOBOT_OWNER_FINAL_2026-11-10'
where store_key = 'main'
  and bakery_lat = 10.77315
  and bakery_lng = 106.70054
  and delivery_origin_approved_at is null
  and delivery_origin_approval_source is null
returning store_key, delivery_origin_approved_at, delivery_origin_approval_source;
```

The Geoapify secret and origin approval should be verified with a signed-in Customer address suggestion and verification request after configuration. No production customer request was made in this audit.
