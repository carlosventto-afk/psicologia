import { launchBrowser, openSearchPage, searchByRegistro } from "../src/crawler.js";
import { classifyBuscaResponse } from "../src/parsing.js";

const browser = await launchBrowser();
const page = await openSearchPage(browser);

for (const registro of [26274, 999999999]) {
  const { status, body } = await searchByRegistro(page, registro);
  const outcome = classifyBuscaResponse(status, body);
  console.log(`registro=${registro} status=${status} outcome=${outcome.type}`, outcome);
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

await browser.close();
