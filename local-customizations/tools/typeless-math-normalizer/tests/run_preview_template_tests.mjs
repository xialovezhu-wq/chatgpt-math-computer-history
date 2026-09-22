import { runPreviewTemplateTests } from "./test_preview_template.mjs";

try {
  await runPreviewTemplateTests();
  console.log("PASS preview template tests");
} catch (error) {
  console.error("FAIL preview template tests");
  console.error(error?.stack || error);
  process.exitCode = 1;
}
