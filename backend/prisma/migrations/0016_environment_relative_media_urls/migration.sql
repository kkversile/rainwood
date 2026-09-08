UPDATE "HotelImage"
SET "url" = regexp_replace(
  "url",
  '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?(/api/v1)?',
  ''
)
WHERE "url" ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?(/api/v1)?/files/public/';

UPDATE "HotelVideo"
SET "url" = regexp_replace(
  "url",
  '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?(/api/v1)?',
  ''
)
WHERE "url" ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?(/api/v1)?/files/public/';

UPDATE "SiteSetting"
SET "value" = regexp_replace(
  "value",
  '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?(/api/v1)?',
  ''
)
WHERE "key" = 'site.logoUrl'
  AND "value" ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?(/api/v1)?/files/public/';
