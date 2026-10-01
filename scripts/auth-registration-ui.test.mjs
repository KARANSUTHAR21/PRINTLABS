import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const login = await readFile(new URL("../src/routes/login.tsx", import.meta.url), "utf8");
const register = await readFile(new URL("../src/routes/register.tsx", import.meta.url), "utf8");

test("account type is compulsory in registration and absent from the login form", () => {
  assert.doesNotMatch(login, /<input[^>]*type="radio"/);
  assert.doesNotMatch(login, /\bCustomer\b|\bVendor\b/);
  assert.match(register, /name="accountType" value="CUSTOMER"[\s\S]*?required/);
  assert.match(register, /name="accountType" value="VENDOR"[\s\S]*?required/);
  assert.match(register, /if \(!accountType\)/);
});
