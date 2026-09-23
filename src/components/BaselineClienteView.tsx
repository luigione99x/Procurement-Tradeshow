// Vista cliente della baseline del risparmio: sola lettura, mostrata solo se
// approvata/bloccata (una bozza interna non ancora validata non è
// un'informazione su cui il cliente debba fare affidamento).
const TIPO_LABEL: Record<string, string> = {
  PREVENTIVO_INCUMBENT: "Preventivo del fornitore uscente",
  PREVENTIVO_PRECEDENTE_COMPARABILE: "Preventivo precedente comparabile",
  PRIMA_MIGLIORE_OFFERTA_COMPARABILE: "Prima migliore offerta comparabile ricevuta",
  CONCORDATA_MANUALMENTE: "Concordata manualmente con il cliente",
};

export default function BaselineClienteView({ tipo, amount }: { tipo: string; amount: string }) {
  return (
    <div className="card">
      <h3 className="font-semibold mb-1">Baseline del risparmio</h3>
      <p className="text-xs text-slate-500 mb-2">
        Il risparmio ottenuto verrà misurato rispetto a questo riferimento, non rispetto al budget dichiarato.
      </p>
      <p className="text-sm">
        <span className="text-slate-500">Fonte:</span> {TIPO_LABEL[tipo] || tipo} · <span className="text-slate-500">Importo:</span> €{amount}
      </p>
    </div>
  );
}
