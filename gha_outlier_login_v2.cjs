const { chromium } = require("playwright");
const fs = require("fs");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().substring(11, 19);
const randId = "danghan" + Math.floor(Math.random() * 900000 + 100000);
const NEW_PASS = "Vianhemoi123!";
console.log("[" + ts() + "] Target: " + randId + "@gmail.com");

async function waitForUrlChange(page, oldUrl, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const url = page.url();
    if (url !== oldUrl) return url;
    await sleep(500);
  }
  return page.url();
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-web-security"] });
    console.log("[" + ts() + "] Browser launched!");
  } catch(e) {
    fs.writeFileSync("browser_error.txt", e.message);
    process.exit(1);
  }

  const ctx = await browser.newContext({ viewport: {width:1280,height:900} });
  const page = await ctx.newPage();

  try {
    // === STEP 1: Name ===
    console.log("[" + ts() + "] Step 1: Name...");
    await page.goto("https://accounts.google.com/signup", { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(2000);

    try {
      await page.locator("#firstName").fill("Dang", {timeout:5000});
      await page.locator("#lastName").fill("Han", {timeout:5000});
      await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
      console.log("[" + ts() + "] Clicked Next after name");
    } catch(e) {
      console.log("[" + ts() + "] Name err: " + e.message);
      fs.writeFileSync("step1_err.txt", e.message); await browser.close(); return;
    }

    const url2 = await waitForUrlChange(page, page.url(), 10000);
    console.log("[" + ts() + "] URL2: " + url2);
    if (!url2.includes("birthdaygender")) {
      const body = await page.evaluate(() => document.body.innerText);
      console.log("[" + ts() + "] NOT BIRTHDAY! Body: " + body.slice(0,300));
      fs.writeFileSync("step1_fail.txt", "URL: " + url2 + "\nBody: " + body.slice(0,300));
      await browser.close(); return;
    }
    await sleep(1000);

    // === STEP 2: Birthday/Gender ===
    console.log("[" + ts() + "] Step 2: Birthday...");
    try {
      // Fill day and year first
      await page.locator("#day").fill("15", {timeout:5000});
      await page.locator("#year").fill("1995", {timeout:5000});
      console.log("[" + ts() + "] Day/Year filled");

      // Month - click and select
      await page.locator("#month").click({timeout:5000});
      await sleep(500);
      const monthOpts = await page.locator("[role=option]").filter({hasText:"March"}).count();
      console.log("[" + ts() + "] Month options found: " + monthOpts);
      if (monthOpts > 0) {
        await page.locator("[role=option]").filter({hasText:"March"}).first().click({force:true});
      }
      await sleep(500);

      // Gender - click and select
      await page.locator("#gender").click({timeout:5000});
      await sleep(500);
      const genderOpts = await page.locator("[role=option]").filter({hasText:"Male"}).count();
      console.log("[" + ts() + "] Gender options found: " + genderOpts);
      if (genderOpts > 0) {
        await page.locator("[role=option]").filter({hasText:"Male"}).first().click({force:true});
      }
      await sleep(500);

      await shot(page, "step2_bday");
      await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
      console.log("[" + ts() + "] Clicked Next after birthday");
    } catch(e) {
      console.log("[" + ts() + "] Birthday err: " + e.message);
      fs.writeFileSync("step2_err.txt", e.message); await browser.close(); return;
    }

    const url3 = await waitForUrlChange(page, url2, 15000);
    console.log("[" + ts() + "] URL3: " + url3);
    if (!url3.includes("username") && !url3.includes("signup/username")) {
      const body = await page.evaluate(() => document.body.innerText);
      console.log("[" + ts() + "] NOT USERNAME! Body: " + body.slice(0,300));
      fs.writeFileSync("step2_fail.txt", "URL: " + url3 + "\nBody: " + body.slice(0,300));
      await browser.close(); return;
    }
    await sleep(1000);

    // === STEP 3: Username ===
    console.log("[" + ts() + "] Step 3: Username...");
    try {
      await page.locator("input[name=Username]").fill(randId, {timeout:5000});
      console.log("[" + ts() + "] Username filled: " + randId);
      await shot(page, "step3_username");
      await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
      console.log("[" + ts() + "] Clicked Next after username");
    } catch(e) {
      console.log("[" + ts() + "] Username err: " + e.message);
      fs.writeFileSync("step3_err.txt", e.message); await browser.close(); return;
    }

    const url4 = await waitForUrlChange(page, url3, 15000);
    console.log("[" + ts() + "] URL4: " + url4);
    const body4 = await page.evaluate(() => document.body.innerText);
    console.log("[" + ts() + "] Body4: " + body4.slice(0,200));

    if (body4.includes("Password") || body4.includes("password") || url4.includes("password")) {
      // === STEP 4: Password ===
      console.log("[" + ts() + "] Step 4: Password...");
      try {
        const pwInputs = page.locator("input[type=password]");
        const cnt = await pwInputs.count();
        console.log("[" + ts() + "] Password inputs: " + cnt);
        if (cnt >= 1) await pwInputs.nth(0).fill(NEW_PASS);
        if (cnt >= 2) await pwInputs.nth(1).fill(NEW_PASS);
        await shot(page, "step4_password");
        await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
        console.log("[" + ts() + "] Clicked Next after password");
        await sleep(5000);
      } catch(e) {
        console.log("[" + ts() + "] Password err: " + e.message);
      }
    }

    const finalUrl = page.url();
    const finalBody = await page.evaluate(() => document.body.innerText);
    console.log("[" + ts() + "] Google Final URL: " + finalUrl);
    console.log("[" + ts() + "] Google Final Body: " + finalBody.slice(0,400));

    fs.writeFileSync("google_account.txt", "email=" + randId + "@gmail.com\npassword=" + NEW_PASS);
    fs.writeFileSync("google_state.txt", "URL: " + finalUrl + "\nBody: " + finalBody.slice(0,500));
    await shot(page, "step_final_google");

    if (finalBody.toLowerCase().includes("verify") || finalBody.toLowerCase().includes("phone")) {
      console.log("[" + ts() + "] PHONE VERIFICATION NEEDED!");
      fs.writeFileSync("phone_needed.txt", "Account: " + randId + "@gmail.com\nURL: " + finalUrl);
    } else if (finalBody.includes("Welcome") || finalUrl.includes("myaccount") || finalUrl.includes("success")) {
      console.log("[" + ts() + "] GOOGLE ACCOUNT CREATED! " + randId + "@gmail.com");
      fs.writeFileSync("google_created.txt", "Account: " + randId + "@gmail.com\nURL: " + finalUrl);
    }

    // === STEP 5: Test Outlier ===
    console.log("[" + ts() + "] Step 5: Outlier login test...");
    try {
      const page2 = await ctx.newPage();
      await page2.goto("https://app.outlier.ai/en/expert/login", { waitUntil: "domcontentloaded", timeout: 20000 });
      await sleep(3000);

      const body1 = await page2.evaluate(() => document.body.innerText);
      console.log("[" + ts() + "] Outlier URL: " + page2.url());
      console.log("[" + ts() + "] Outlier Body: " + body1.slice(0,300));

      if (body1.includes("not available in your country")) {
        console.log("[" + ts() + "] OUTLIER GEO-BLOCKED!");
        fs.writeFileSync("outlier_landing_blocked.txt", body1.slice(0,300));
        await browser.close(); return;
      }

      const gBtn = page2.locator("button").filter({ hasText: /Google/i }).first();
      if (await gBtn.count() > 0) {
        await gBtn.click({force:true});
        console.log("[" + ts() + "] Clicked Google");
        await sleep(6000);

        const pages = ctx.pages();
        let gp = pages.find(p => p.url().includes("accounts.google")) || page2;
        await gp.bringToFront();

        try {
          await gp.locator("#identifierId").fill(randId + "@gmail.com", {timeout:5000});
          await gp.keyboard.press("Enter");
          await sleep(5000);
        } catch(e) { console.log("[" + ts() + "] Email err: " + e.message); }

        try {
          await gp.locator("input[name=Passwd]").fill(NEW_PASS, {timeout:5000});
          await gp.keyboard.press("Enter");
          await sleep(8000);
        } catch(e) { console.log("[" + ts() + "] PW err: " + e.message); }

        const oUrl = gp.url();
        const oBody = await gp.evaluate(() => document.body.innerText);
        console.log("[" + ts() + "] Outlier OAuth URL: " + oUrl);
        console.log("[" + ts() + "] Outlier OAuth Body: " + oBody.slice(0,300));
        await shot(gp, "outlier_oauth_result");

        if (oUrl.includes("unavailable") || oBody.includes("not available")) {
          console.log("[" + ts() + "] OUTLIER BLOCKED AT OAUTH");
          fs.writeFileSync("outlier_blocked.txt", "URL: " + oUrl + "\nBody: " + oBody.slice(0,300));
        } else if (oUrl.includes("outlier") && !oUrl.includes("login") && !oUrl.includes("unavailable")) {
          console.log("[" + ts() + "] OUTLIER SUCCESS!");
          fs.writeFileSync("outlier_success.txt", "URL: " + oUrl);
          const cookies = await ctx.cookies();
          fs.writeFileSync("outlier_cookies.json", JSON.stringify(cookies));
        } else {
          fs.writeFileSync("outlier_check.txt", "URL: " + oUrl + "\nBody: " + oBody.slice(0,300));
        }
      } else {
        fs.writeFileSync("no_google_btn.txt", body1.slice(0,300));
      }
    } catch(e) {
      console.log("[" + ts() + "] Outlier test err: " + e.message);
      fs.writeFileSync("outlier_test_err.txt", e.message);
    }

  } catch(e) {
    console.error("[" + ts() + "] FATAL: " + e.message);
    fs.writeFileSync("ERROR.txt", e.message + "\n" + (e.stack||"").slice(0,500));
  }

  await browser.close();
  console.log("[" + ts() + "] DONE");
}

// Simple screenshot helper
async function shot(page, name) {
  try {
    const fn = "shot_" + name + "_" + Date.now() + ".png";
    await page.screenshot({ path: fn, fullPage: false });
    console.log("[" + ts() + "] Shot: " + fn);
  } catch(e) {
    console.log("[" + ts() + "] Shot err: " + e.message);
  }
}

main().catch(e => {
  console.error("[" + ts() + "] UNCAUGHT: " + e.message);
  process.exit(1);
});
