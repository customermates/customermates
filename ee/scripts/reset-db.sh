#!/bin/bash

# Check if -f flag is provided
if [ "$1" == "-f" ]; then
    # Force push schema and run seed
    echo "Force pushing schema and running seed..."
    npx prisma db push --force-reset
    npx prisma db seed
else
    # Normal migrate reset
    echo "Resetting the Prisma database..."
    npx prisma migrate reset --force
    npx prisma db seed
fi

echo "Database reset complete!"
