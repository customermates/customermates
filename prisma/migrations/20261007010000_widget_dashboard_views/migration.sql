ALTER TABLE "Widget" ADD COLUMN "viewId" TEXT;

CREATE INDEX "Widget_viewId_idx" ON "Widget"("viewId");

ALTER TABLE "Widget" ADD CONSTRAINT "Widget_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "DataView"("id") ON DELETE SET NULL ON UPDATE CASCADE;
