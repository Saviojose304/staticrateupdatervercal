"use client";

import { useState } from "react";
import { WhatsAppIcon } from "./icons";

export default function ShareLinkPanel({ publicRateUrl }: { publicRateUrl: string }) {
  const [copied, setCopied] = useState(false);
  const message = `Please check the latest market rate here: ${publicRateUrl}`;
  // wa.me opens the WhatsApp app on Android and lets the admin pick a contact or group.
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicRateUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", publicRateUrl);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Permanent customer link</p>
        <p className="mt-1 break-all font-mono text-sm text-slate-900">{publicRateUrl}</p>
      </div>

      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1a7f4b] px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-[#15693e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        <WhatsAppIcon />
        Share on WhatsApp
      </a>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={copyLink}
          className="min-h-11 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <a
          href="/rate"
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          View public page
        </a>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Message preview: <span className="text-slate-700">“{message}”</span>
      </p>
    </div>
  );
}
