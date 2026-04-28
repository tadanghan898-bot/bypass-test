const { chromium } = require("playwright");
const fs = require("fs");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().substring(11, 19);
const randId = "danghan" + Math.floor(Math.random() * 900000 + 100000);
const NEW_PASS = "Vianhemoi123!";
console.log("[" + ts() + "] Target: " + randId + "@gmail.com");

async function waitForUrlChange(page, timeout = 20000) {
  const start = Date.now();
  const oldUrl = page.url();
  while (Date.now() - start < timeout) {
    const url = page.url();
    if (url !== oldUrl) return url;
    await sleep(500);
  }
  return page.url();
}

async function shot(page, name) {
  try {
    const fn = "shot_" + name + "_" + Date.now() + ".png";
    await page.screenshot({ path: fn, fullPage: false });
    console.log("[" + ts() + "] Shot: " + fn);
  } catch(e) { console.log("[" + ts() + "] Shot err: " + e.message); }
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--ash-host-window-bounds=1",
        "--force-device-scale-factor=1",
        "--no-first-run",
        "--no-service-autorun",
        "--password-store=basic",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--mute-audio",
        "--start-maximized",
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      ]
    });
    console.log("[" + ts() + "] Browser launched!");
  } catch(e) {
    fs.writeFileSync("browser_error.txt", e.message);
    process.exit(1);
  }

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/New_York",
    permissions: [],
    ignoreHTTPSErrors: true
  });

  // Inject stealth scripts
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
    delete navigator.__proto__?.webdriver;
  });

  try {
    // === STEP 1: Google Signup ===
    console.log("[" + ts() + "] Step 1: Google signup...");
    await page.goto("https://accounts.google.com/signup", { waitUntil: "networkidle", timeout: 20000 });
    await sleep(2000);
    await shot(page, "01_landing");

    // Fill name
    try {
      await page.locator("#firstName").fill("Dang", {timeout:5000});
      await page.locator("#lastName").fill("Han", {timeout:5000});
      await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
      console.log("[" + ts() + "] Name submitted");
    } catch(e) {
      console.log("[" + ts() + "] Name err: " + e.message);
      fs.writeFileSync("step1_err.txt", e.message); await browser.close(); return;
    }

    const url2 = await waitForUrlChange(page, 12000);
    console.log("[" + ts() + "] URL2: " + url2);
    if (!url2.includes("birthdaygender")) {
      const body = await page.evaluate(() => document.body.innerText);
      console.log("[" + ts() + "] NOT BIRTHDAY! Body: " + body.slice(0,300));
      fs.writeFileSync("step1_fail.txt", "URL: " + url2 + "\nBody: " + body.slice(0,300));
      await shot(page, "not_birthday");
      await browser.close(); return;
    }
    await sleep(500);

    // === STEP 2: Birthday ===
    console.log("[" + ts() + "] Step 2: Birthday...");
    try {
      await page.locator("#day").fill("15", {timeout:5000});
      await page.locator("#year").fill("1995", {timeout:5000});

      // Month
      await page.locator("#month").click({timeout:5000});
      await sleep(400);
      const mCount = await page.locator("[role=option]").filter({hasText:"March"}).count();
      console.log("[" + ts() + "] March options: " + mCount);
      if (mCount > 0) {
        await page.locator("[role=option]").filter({hasText:"March"}).first().click({force:true});
      }
      await sleep(400);

      // Gender
      await page.locator("#gender").click({timeout:5000});
      await sleep(400);
      const gCount = await page.locator("[role=option]").filter({hasText:"Male"}).count();
      console.log("[" + ts() + "] Male options: " + gCount);
      if (gCount > 0) {
        await page.locator("[role=option]").filter({hasText:"Male"}).first().click({force:true});
      }
      await sleep(400);

      await shot(page, "02_bday_filled");
      await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
      console.log("[" + ts() + "] Birthday submitted");
    } catch(e) {
      console.log("[" + ts() + "] Bday err: " + e.message);
      fs.writeFileSync("step2_err.txt", e.message); await browser.close(); return;
    }

    const url3 = await waitForUrlChange(page, 15000);
    console.log("[" + ts() + "] URL3: " + url3);
    const body3 = await page.evaluate(() => document.body.innerText);
    console.log("[" + ts() + "] Body3: " + body3.slice(0,200));

    if (!url3.includes("username") && !body3.includes("username") && !body3.includes("email") && !body3.includes(" Gmail")) {
      console.log("[" + ts() + "] NOT USERNAME!");
      fs.writeFileSync("step2_fail.txt", "URL: " + url3 + "\nBody: " + body3.slice(0,300));
      await shot(page, "not_username");
      await browser.close(); return;
    }
    await sleep(500);

    // === STEP 3: Username ===
    console.log("[" + ts() + "] Step 3: Username...");
    try {
      // Wait for username field to appear
      await page.waitForSelector("input[name=Username]", {timeout: 8000}).catch(() => {});
      await page.locator("input[name=Username]").fill(randId, {timeout:5000});
      console.log("[" + ts() + "] Username: " + randId);
      await shot(page, "03_username_filled");
      await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
      console.log("[" + ts() + "] Username submitted");
    } catch(e) {
      console.log("[" + ts() + "] Username err: " + e.message);
      fs.writeFileSync("step3_err.txt", e.message); await browser.close(); return;
    }

    const url4 = await waitForUrlChange(page, 15000);
    console.log("[" + ts() + "] URL4: " + url4);
    const body4 = await page.evaluate(() => document.body.innerText);
    console.log("[" + ts() + "] Body4: " + body4.slice(0,200));

    // === STEP 4: Password ===
    if (body4.includes("Password") || body4.includes("password") || url4.includes("password")) {
      console.log("[" + ts() + "] Step 4: Password...");
      try {
        const pwInputs = page.locator("input[type=password]");
        const cnt = await pwInputs.count();
        console.log("[" + ts() + "] PW inputs: " + cnt);
        if (cnt >= 1) await pwInputs.nth(0).fill(NEW_PASS);
        if (cnt >= 2) await pwInputs.nth(1).fill(NEW_PASS);
        await shot(page, "04_password_filled");
        await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
        console.log("[" + ts() + "] Password submitted");
        await sleep(5000);
      } catch(e) {
        console.log("[" + ts() + "] PW err: " + e.message);
      }
    }

    const finalUrl = page.url();
    const finalBody = await page.evaluate(() => document.body.innerText);
    console.log("[" + ts() + "] Google Final URL: " + finalUrl);
    console.log("[" + ts() + "] Google Final Body: " + finalBody.slice(0,400));
    await shot(page, "05_google_final");

    fs.writeFileSync("google_account.txt", "email=" + randId + "@gmail.com\npassword=" + NEW_PASS);
    fs.writeFileSync("google_state.txt", "URL: " + finalUrl + "\nBody: " + finalBody.slice(0,500));

    if (finalBody.toLowerCase().includes("verify") || finalBody.toLowerCase().includes("phone")) {
      console.log("[" + ts() + "] PHONE VERIFICATION!");
      fs.writeFileSync("phone_needed.txt", "Account: " + randId + "@gmail.com\nURL: " + finalUrl);
    } else if (finalBody.includes("Welcome") || finalUrl.includes("myaccount") || finalUrl.includes("success")) {
      console.log("[" + ts() + "] GOOGLE ACCOUNT CREATED!");
      fs.writeFileSync("google_created.txt", "Account: " + randId + "@gmail.com\nURL: " + finalUrl);
    } else if (finalBody.includes("could not create") || finalBody.includes("Error") || finalBody.includes("error")) {
      console.log("[" + ts() + "] GOOGLE BLOCKED!");
      fs.writeFileSync("google_blocked.txt", "URL: " + finalUrl + "\nBody: " + finalBody.slice(0,500));
    }

    // === STEP 5: Outlier ===
    console.log("[" + ts() + "] Step 5: Outlier...");
    const page2 = await ctx.newPage();
    await page2.goto("https://app.outlier.ai/en/expert/login", { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(3000);

    const body1 = await page2.evaluate(() => document.body.innerText);
    console.log("[" + ts() + "] Outlier URL: " + page2.url());
    console.log("[" + ts() + "] Outlier Body: " + body1.slice(0,300));

    if (body1.includes("not available")) {
      console.log("[" + ts() + "] OUTLIER BLOCKED AT LANDING!");
      fs.writeFileSync("outlier_landing_blocked.txt", body1.slice(0,300));
      await shot(page2, "outlier_landing_blocked");
      await browser.close(); return;
    }

    const gBtn = page2.locator("button").filter({ hasText: /Google/i }).first();
    if (await gBtn.count() > 0) {
      await gBtn.click({force:true});
      console.log("[" + ts() + "] Clicked Google");
      await sleep(6000);
      await shot(page2, "06_after_google_click");

      const pages = ctx.pages();
      let gp = pages.find(p => p.url().includes("accounts.google")) || page2;
      await gp.bringToFront();

      try {
        await gp.locator("#identifierId").fill(randId + "@gmail.com", {timeout:5000});
        await gp.keyboard.press("Enter");
        await sleep(5000);
      } catch(e) { console.log("[" + ts() + "] Email err: " + e.message); }
      await shot(gp, "07_after_email");

      try {
        await gp.locator("input[name=Passwd]").fill(NEW_PASS, {timeout:5000});
        await gp.keyboard.press("Enter");
        await sleep(8000);
      } catch(e) { console.log("[" + ts() + "] PW err: " + e.message); }
      await shot(gp, "08_outlier_result");

      const oUrl = gp.url();
      const oBody = await gp.evaluate(() => document.body.innerText);
      console.log("[" + ts() + "] Outlier OAuth URL: " + oUrl);
      console.log("[" + ts() + "] Outlier OAuth Body: " + oBody.slice(0,300));

      if (oUrl.includes("unavailable") || oBody.includes("not available")) {
        console.log("[" + ts() + "] OUTLIER BLOCKED AT OAUTH");
        fs.writeFileSync("outlier_blocked.txt", "URL: " + oUrl + "\nBody: " + oBody.slice(0,300));
      } else if (oUrl.includes("outlier") && !oUrl.includes("login") && !oUrl.includes("unavailable")) {
        console.log("[" + ts() + "] OUTLIER SUCCESS!");
        fs.writeFileSync("outlier_success.txt", "URL: " + oUrl);
        fs.writeFileSync("outlier_cookies.json", JSON.stringify(await ctx.cookies()));
      } else {
        fs.writeFileSync("outlier_check.txt", "URL: " + oUrl + "\nBody: " + oBody.slice(0,300));
      }
    } else {
      fs.writeFileSync("no_google_btn.txt", body1.slice(0,300));
    }

  } catch(e) {
    console.error("[" + ts() + "] FATAL: " + e.message);
    fs.writeFileSync("ERROR.txt", e.message + "\n" + (e.stack||"").slice(0,500));
  }

  await browser.close();
  console.log("[" + ts() + "] DONE");
}

main().catch(e => {
  console.error("[" + ts() + "] UNCAUGHT: " + e.message);
  fs.writeFileSync("ERROR.txt", e.message);
  process.exit(1);
});
