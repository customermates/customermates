#!/bin/bash

# Seed Creator Runner Script
# This script runs the seed creator to dump database data to JSON files

set -e  # Exit on any error

echo "🌱 Starting Seed Creator..."
echo "================================"

# Check if we're in the right directory
if [ ! -f "prisma/seedCreator.ts" ]; then
    echo "❌ Error: seedCreator.ts not found!"
    echo "Please run this script from the project root directory."
    exit 1
fi

# Check if tsx is available
if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx is not available!"
    echo "Please install Node.js and npm first."
    exit 1
fi

# Check if the project has the required dependencies
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found!"
    echo "Please run this script from the project root directory."
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Run the seed creator
echo "🚀 Running seed creator..."
echo "This will dump all database tables to JSON files in prisma/seeds/"

if npx tsx prisma/seedCreator.ts; then
    echo ""
    echo "🎉 Seed creator completed successfully!"
    echo ""
    echo "📁 Generated files:"
    echo "   - prisma/seeds/ (folder with JSON files)"
    echo "   - prisma/seed.ts (seeding script)"
    echo ""
    echo "💡 Next steps:"
    echo "   1. Review the generated JSON files in prisma/seeds/"
    echo "   2. Run 'bash ee/scripts/reset-db.sh' to populate a database"
    echo "   3. Or run 'npx prisma db seed' if you have it configured in package.json"
else
    echo ""
    echo "❌ Seed creator failed!"
    echo "Please check the error messages above and try again."
    exit 1
fi
