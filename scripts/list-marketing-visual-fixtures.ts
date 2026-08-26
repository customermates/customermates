import { getNativeVisualFixtureCatalog } from "../components/marketing/visuals/native-fixtures";

process.stdout.write(`${JSON.stringify(getNativeVisualFixtureCatalog(), null, 2)}\n`);
