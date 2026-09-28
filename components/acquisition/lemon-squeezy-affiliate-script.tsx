"use client";

import { useEffect } from "react";

import { scheduleLemonSqueezyAffiliate } from "./lemon-squeezy-affiliate";

export function LemonSqueezyAffiliateScript() {
  useEffect(() => scheduleLemonSqueezyAffiliate(window, document), []);

  return null;
}
