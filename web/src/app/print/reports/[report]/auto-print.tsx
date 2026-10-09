"use client";

import { useEffect } from "react";

/** Opens the print dialog once the report is on screen, where it can be saved as PDF. */
export function AutoPrint() {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 400);
    return () => clearTimeout(id);
  }, []);
  return null;
}
