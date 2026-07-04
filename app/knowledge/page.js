"use client";
import { useEffect } from "react";
export default function KnowledgeRedirect() {
  useEffect(() => { location.replace("/study"); }, []);
  return null;
}
