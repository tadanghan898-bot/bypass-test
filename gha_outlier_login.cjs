const { chromium } = require("playwright");
const fs = require("fs");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().substring(11, 19);
const randId = "danghan" + Math.floor(Math.random() * 900000 + 100000);
const NEW_PASS = "Vianhemoi123!";
console.log("[" + ts() + "] Target: " + randId + "@gmail.com");

async function main() {
  let browser;
  try {
    console.log("[" + ts() + "] Launching browser...");
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu"] });
    console.log("[" + ts() + "] Browser launched!");
  } catch(e) {
    console.error("[" + ts() + "] Browser launch failed: " + e.message);
    fs.writeFileSync("browser_error.txt", e.message);
    process.exit(1);
  }

  const ctx = await browser.newContext({ viewport: {width:1280,height:900} });
  const page = await ctx.newPage();

  try {
    console.log("[" + ts() + "] Creating Google account from US IP...");
    await page.goto("https://accounts.google.com/signup", { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(3000);

    await page.locator("#firstName").fill("Dang", {timeout:5000});
    await page.locator("#lastName").fill("Han", {timeout:5000});
    await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
    console.log("[" + ts() + "] Name submitted");
    await sleep(5000);

    let url = page.url();
    if (!url.includes("birthdaygender")) {
      console.log("[" + ts() + "] Not birthday page. URL: " + url);
      fs.writeFileSync("step1_fail.txt", "URL: " + url + "\nBody: " + (await page.evaluate(() => document.body.innerText)).slice(0,300));
      await browser.close(); return;
    }

    await page.locator("#day").fill("15", {timeout:5000});
    await page.locator("#year").fill("1995", {timeout:5000});
    await page.locator("#month").click({timeout:5000});
    await sleep(800);
    await page.locator("[role=option]").filter({hasText:"March"}).first().click({force:true, timeout:5000});
    await sleep(500);
    await page.locator("#gender").click({timeout:5000});
    await sleep(800);
    await page.locator("[role=option]").filter({hasText:"Male"}).first().click({force:true, timeout:5000});
    console.log("[" + ts() + "] Birthday filled");
    await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
    await sleep(6000);

    url = page.url();
    if (!url.includes("username")) {
      console.log("[" + ts() + "] Not username page. URL: " + url);
      fs.writeFileSync("step2_fail.txt", "URL: " + url + "\nBody: " + (await page.evaluate(() => document.body.innerText)).slice(0,300));
      await browser.close(); return;
    }

    await page.locator("input[name=Username]").fill(randId, {timeout:5000});
    console.log("[" + ts() + "] Username filled: " + randId);
    await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
    await sleep(8000);

    url = page.url();
    const body4 = await page.evaluate(() => document.body.innerText);
    console.log("[" + ts() + "] URL4: " + url);

    if (body4.includes("Password") || url.includes("password")) {
      const pwInputs = page.locator("input[type=password]");
      const cnt = await pwInputs.count();
      if (cnt >= 1) await pwInputs.nth(0).fill(NEW_PASS);
      if (cnt >= 2) await pwInputs.nth(1).fill(NEW_PASS);
      await page.locator("button").filter({hasText:"Next"}).first().click({force:true});
      console.log("[" + ts() + "] Password submitted");
      await sleep(10000);
    }

    const finalUrl = page.url();
    const finalBody = await page.evaluate(() => document.body.innerText);
    console.log("[" + ts() + "] Google Final URL: " + finalUrl);
    console.log("[" + ts() + "] Google Final Body: " + finalBody.slice(0,300));

    fs.writeFileSync("google_account.txt", "email=" + randId + "@gmail.com\npassword=" + NEW_PASS);
    fs.writeFileSync("google_state.txt", "URL: " + finalUrl + "\nBody: " + finalBody.slice(0,500));

    if (finalBody.toLowerCase().includes("verify") || finalBody.toLowerCase().includes("phone")) {
      console.log("[" + ts() + "] PHONE VERIFICATION NEEDED!");
      fs.writeFileSync("phone_needed.txt", "Account: " + randId + "@gmail.com");
    } else if (finalBody.includes("Welcome") || finalUrl.includes("myaccount")) {
      console.log("[" + ts() + "] GOOGLE ACCOUNT CREATED! " + randId + "@gmail.com");
    }

    // Now test Outlier
    console.log("[" + ts() + "] Testing Outlier login...");
    const page2 = await ctx.newPage();
    await page2.goto("https://app.outlier.ai/en/expert/login", { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(3000);

    const body1 = await page2.evaluate(() => document.body.innerText);
    console.log("[" + ts() + "] Outlier URL: " + page2.url());
    console.log("[" + ts() + "] Outlier Body: " + body1.slice(0,300));

    if (body1.includes("not available in your country")) {
      console.log("[" + ts() + "] OUTLIER GEO-BLOCKED AT LANDING!");
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
      console.log("[" + ts() + "] Outlier URL: " + oUrl);
      console.log("[" + ts() + "] Outlier Body: " + oBody.slice(0,300));

      if (oUrl.includes("unavailable") || oBody.includes("not available")) {
        console.log("[" + ts() + "] OUTLIER BLOCKED");
        fs.writeFileSync("outlier_blocked.txt", "URL: " + oUrl + "\nBody: " + oBody.slice(0,300));
      } else if (oUrl.includes("outlier") && !oUrl.includes("login")) {
        console.log("[" + ts() + "] OUTLIER SUCCESS!");
        fs.writeFileSync("outlier_success.txt", "URL: " + oUrl);
        const cookies = await ctx.cookies();
        fs.writeFileSync("outlier_cookies.json", JSON.stringify(cookies));
      } else {
        fs.writeFileSync("outlier_check.txt", "URL: " + oUrl + "\nBody: " + oBody.slice(0,300));
      }
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
