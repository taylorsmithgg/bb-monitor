/**
 * Read the drop pages that block a plain client, then write one state file.
 *
 * The reader runs on a hosted runner, so every run uses a new address.
 * The tracker reads the state file through its public monitor source.
 */

import { chromium } from "patchright";

interface Watch {
  name: string;
  store: string;
  url: string;
}

const WATCHES: Watch[] = [
  { name: "Pokemon Center TCG new releases", store: "Pokémon Center", url: "https://www.pokemoncenter.com/category/new-releases" },
  { name: "Pokemon Center trading card game", store: "Pokémon Center", url: "https://www.pokemoncenter.com/category/trading-card-game" },
  { name: "30th Celebration Pokemon Center ETB", store: "Pokémon Center", url: "https://www.pokemoncenter.com/product/10-10447-111" },
  { name: "Mega Evolution Pitch Black Pokemon Center ETB", store: "Pokémon Center", url: "https://www.pokemoncenter.com/product/10-10416-112" },
  { name: "Target Pokemon trading cards", store: "Target", url: "https://www.target.com/s?searchTerm=pokemon+elite+trainer+box" },
];

interface Reading {
  name: string;
  store: string;
  url: string;
  available: boolean;
  price: string | null;
  checkedAt: string;
  chars: number;
  blocked: boolean;
}

async function main(): Promise<void> {
  const context = await chromium.launchPersistentContext("/tmp/bb-profile", {
    channel: "chrome",
    headless: false,
    viewport: null,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const out: Reading[] = [];

  for (const watch of WATCHES) {
    let chars = 0;
    let price: string | null = null;
    let available = false;
    let blocked = true;
    try {
      await page.goto(watch.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(9_000);
      const seen = (await page.evaluate(() => {
        const body = (document.body?.innerText ?? "").replace(/\s+/g, " ");
        return {
          chars: body.length,
          price: (body.match(/\$[0-9]+\.[0-9]{2}/) ?? [null])[0],
          cart: /add to cart|add to bag/i.test(body),
          soldOut: /sold out|out of stock|notify me/i.test(body),
        };
      })) as { chars: number; price: string | null; cart: boolean; soldOut: boolean };
      chars = seen.chars;
      price = seen.price;
      available = seen.cart && !seen.soldOut;
      blocked = seen.chars < 1_500;
    } catch (error) {
      console.log(`${watch.name}: ${String(error).split("\n")[0]}`);
    }
    out.push({ ...watch, available, price, checkedAt: new Date().toISOString(), chars, blocked });
    console.log(`${watch.store} | ${watch.name} | chars ${chars} | price ${price ?? "none"} | ${blocked ? "blocked" : "read"}`);
  }

  await context.close();
  await Bun.write("state.json", `${JSON.stringify(out, null, 1)}\n`);
}

await main();
