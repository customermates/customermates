#!/bin/bash
# Generate hero images for all for-pages
# Each slug generates 1 Flux image (base), then composites into light/dark × en/de = 4 output images
# Sleep between Flux generations to avoid rate limits

set -e

SCRIPT=".claude/seo/generate-hero-image.ts"

# Format: slug|EN title text|DE title text
# Titles must fit MAX_CHARS_PER_LINE=22 chars per line
# Use <purple>...</purple> for accent color

PAGES=(
  "real-estate|CRM for <purple>Real Estate</purple>|CRM für <purple>Immobilien</purple>"
  "smb|CRM for <purple>Small Business</purple>|CRM für <purple>kleine Unternehmen</purple>"
  "personal|Your <purple>Personal</purple> CRM|Dein <purple>persönliches</purple> CRM"
  "law-firms|CRM for <purple>Law Firms</purple>|CRM für <purple>Kanzleien</purple>"
  "insurance-agents|CRM for <purple>Insurance</purple> Agents|CRM für <purple>Versicherungs</purple>makler"
  "startups|CRM for <purple>Startups</purple>|CRM für <purple>Startups</purple>"
  "travel-agents|CRM for <purple>Travel</purple> Agents|CRM für <purple>Reisebüros</purple>"
  "contractors|CRM for <purple>Contractors</purple>|CRM für <purple>Auftragnehmer</purple>"
  "marketing-agencies|CRM for <purple>Marketing</purple> Agencies|CRM für <purple>Marketing</purple>agenturen"
  "field-service|CRM for <purple>Field Service</purple>|CRM für den <purple>Außendienst</purple>"
  "lawyers|CRM for <purple>Lawyers</purple>|CRM für <purple>Anwälte</purple>"
  "hvac|CRM for <purple>HVAC</purple> Companies|CRM für <purple>SHK-Betriebe</purple>"
  "mortgage-brokers|CRM for <purple>Mortgage</purple> Brokers|CRM für <purple>Baufinanzierer</purple>"
  "financial-advisors|CRM for <purple>Financial</purple> Advisors|CRM für <purple>Finanzberater</purple>"
  "professional-services|CRM for <purple>Professional</purple> Services|CRM für <purple>Dienstleister</purple>"
  "consultants|CRM for <purple>Consultants</purple>|CRM für <purple>Berater</purple>"
  "therapists|CRM for <purple>Therapists</purple>|CRM für <purple>Therapeuten</purple>"
  "plumbers|CRM for <purple>Plumbers</purple>|CRM für <purple>Sanitärbetriebe</purple>"
  "accountants|CRM for <purple>Accountants</purple>|CRM für <purple>Steuerberater</purple>"
  "construction|CRM for <purple>Construction</purple>|CRM für <purple>Bauunternehmen</purple>"
  "coaches|CRM for <purple>Coaches</purple>|CRM für <purple>Coaches</purple>"
  "logistics|CRM for <purple>Logistics</purple>|CRM für <purple>Logistik</purple>"
  "restaurants|CRM for <purple>Restaurants</purple>|CRM für <purple>Gastronomie</purple>"
  "freelancers|CRM for <purple>Freelancers</purple>|CRM für <purple>Freelancer</purple>"
  "electricians|CRM for <purple>Electricians</purple>|CRM für <purple>Elektriker</purple>"
  "solopreneurs|CRM for <purple>Solopreneurs</purple>|CRM für <purple>Solopreneure</purple>"
  "insurance-companies|CRM for <purple>Insurance</purple> Companies|CRM für <purple>Versicherungen</purple>"
  "mid-market|CRM for the <purple>Mid-Market</purple>|CRM für den <purple>Mittelstand</purple>"
  "cleaning-companies|CRM for <purple>Cleaning</purple> Companies|CRM für <purple>Reinigung</purple>"
  "solar-companies|CRM for <purple>Solar</purple> Companies|CRM für <purple>Solar</purple>unternehmen"
  "architects|CRM for <purple>Architects</purple>|CRM für <purple>Architekten</purple>"
  "auto-repair|CRM for <purple>Auto Repair</purple>|CRM für <purple>Autowerkstätten</purple>"
  "tradespeople|CRM for <purple>Tradespeople</purple>|CRM für <purple>Handwerker</purple>"
  "realtors|CRM for <purple>Realtors</purple>|CRM für <purple>Immobilienmakler</purple>"
  "b2b|<purple>B2B</purple> CRM System|<purple>B2B</purple> CRM System"
)

TOTAL=${#PAGES[@]}
COUNT=0

for entry in "${PAGES[@]}"; do
  IFS='|' read -r slug en_title de_title <<< "$entry"
  COUNT=$((COUNT + 1))

  BASE_IMG="public/images/base/${slug}.png"
  EN_LIGHT="public/images/light/en/${slug}.png"
  DE_LIGHT="public/images/light/de/${slug}.png"

  # Skip if base image exists and all outputs exist
  if [[ -f "$BASE_IMG" && -f "$EN_LIGHT" && -f "$DE_LIGHT" ]]; then
    echo "[$COUNT/$TOTAL] Skipping $slug (already exists)"
    continue
  fi

  echo "[$COUNT/$TOTAL] Generating $slug..."

  # If no base image, we need a Flux generation — wait 12s first to respect rate limit
  if [[ ! -f "$BASE_IMG" ]]; then
    echo "  Waiting 12s for rate limit..."
    sleep 12
  fi

  # Generate EN light (this also creates base + dark/en)
  npx tsx "$SCRIPT" \
    --title "$en_title" \
    --out "$EN_LIGHT" \
    $([ -f "$BASE_IMG" ] && echo "--bg $BASE_IMG" || echo "")

  # Generate DE light using the base image (no new Flux call needed)
  npx tsx "$SCRIPT" \
    --title "$de_title" \
    --bg "$BASE_IMG" \
    --out "$DE_LIGHT"

  echo "  Done: $slug"
done

echo ""
echo "All $TOTAL for-page hero images generated!"
