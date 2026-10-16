-- Postal codes from GeoNames (CC BY 4.0), loaded per country on first use.
CREATE TABLE "PostalCodeCountry" (
    "countryCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "loadedAt" TIMESTAMP(3),
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failure" TEXT,

    CONSTRAINT "PostalCodeCountry_pkey" PRIMARY KEY ("countryCode"),
    CONSTRAINT "PostalCodeCountry_status_check" CHECK ("status" IN ('loading', 'ready', 'failed', 'unavailable'))
);

CREATE TABLE "PostalCode" (
    "countryCode" TEXT NOT NULL,
    "postalKey" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "postalCode" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PostalCode_pkey" PRIMARY KEY ("countryCode", "postalKey", "ordinal")
);
