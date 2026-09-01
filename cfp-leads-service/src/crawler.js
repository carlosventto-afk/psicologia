import { chromium } from "playwright";

const BASE_URL = "https://cadastro.cfp.org.br/";
const BUSCA_URL_FRAGMENT = "cn-api.cfp.org.br/psi/busca";

export async function launchBrowser() {
  return chromium.launch({ headless: true });
}

export async function openSearchPage(browser) {
  const page = await browser.newPage();
  await page.goto(BASE_URL);
  await page
    .getByRole("combobox", { name: "Estado" })
    .selectOption({ label: "Rio de Janeiro - CRP 5ª Região" });
  await page.getByRole("button", { name: "BUSCA AVANÇADA" }).click();
  // The invisible reCAPTCHA v2 token is generated asynchronously by Google's JS
  // after this point. If searchByRegistro fires immediately, the site submits
  // with an empty recaptchaToken and the API rejects with a captcha_failure
  // (422, {recaptchaToken: [...]}) even though nothing is visibly wrong.
  // Confirmed live: without this wait the very first search after page setup
  // failed with an empty recaptchaToken; waiting here lets token generation
  // settle before any search is attempted.
  await page.waitForTimeout(3000);
  return page;
}

export async function searchByRegistro(page, registro, _retried = false) {
  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes(BUSCA_URL_FRAGMENT) &&
        response.url().includes(`registro=${registro}`),
      { timeout: 30000 }
    )
    .catch(() => null);

  await page.getByRole("textbox", { name: "Número de registro" }).fill(String(registro));
  await page.getByRole("button", { name: "BUSCAR" }).click();

  const response = await responsePromise;
  if (!response) {
    return { status: "timeout", body: null };
  }

  const status = response.status();
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  // The site generates its invisible reCAPTCHA token asynchronously. On rare
  // occasions the token isn't ready yet when BUSCAR is clicked, and the site
  // submits with an empty recaptchaToken, which the API rejects with 422 and
  // a body of {recaptchaToken: ["O campo recaptcha token é obrigatório."]}.
  // This is transient (confirmed live: retrying shortly after succeeds with
  // a freshly generated token), so retry once before surfacing it as a real
  // captcha_failure.
  const isEmptyTokenValidationError =
    status === 422 && body && Array.isArray(body.recaptchaToken);
  if (isEmptyTokenValidationError && !_retried) {
    await page.waitForTimeout(2000);
    return searchByRegistro(page, registro, true);
  }

  return { status, body };
}
