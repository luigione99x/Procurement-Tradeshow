"use client";

export default function StampaReportButton() {
  return (
    <button className="btn-secondary text-sm" onClick={() => window.print()}>
      Stampa / salva PDF
    </button>
  );
}
