// Vista offerte per il cliente: sola lettura, redatta server-side. Nessuna
// modifica ai campi, nessuna richiesta di negoziazione, nessuna registrazione
// della decisione finale: quella parte operativa resta riservata allo staff
// Miralis nell'MVP (stesso principio già applicato a Fornitori/Comunicazioni),
// il cliente segue qui il confronto e l'eventuale esito.
type OffertaClienteRow = {
  id: string;
  fornitore: { nome: string };
  stato: string;
  prezzo: string | null;
  valuta: string | null;
  condizioniPagamento: string | null;
  tempiConsegna: string | null;
  esclusioni: string | null;
};

export default function OfferteClienteView({
  offerte,
  decisione,
}: {
  offerte: OffertaClienteRow[];
  decisione: { fornitoreNome: string; prezzoFinale: string | null } | null;
}) {
  if (decisione) {
    return (
      <div className="card bg-green-50 border-green-200">
        <h3 className="font-semibold text-green-900 mb-2">Fornitore scelto: {decisione.fornitoreNome}</h3>
        <p className="text-sm text-green-800">Prezzo finale: €{decisione.prezzoFinale ?? "—"}</p>
      </div>
    );
  }

  if (offerte.length === 0) {
    return <div className="card text-slate-400 text-sm">Nessuna offerta ricevuta ancora.</div>;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2 border-b border-slate-200 w-40">Fornitore</th>
            <th className="text-left p-2 border-b border-slate-200">Prezzo</th>
            <th className="text-left p-2 border-b border-slate-200">Condizioni di pagamento</th>
            <th className="text-left p-2 border-b border-slate-200">Tempi</th>
            <th className="text-left p-2 border-b border-slate-200">Esclusioni</th>
          </tr>
        </thead>
        <tbody>
          {offerte.map((o) => (
            <tr key={o.id} className="border-b border-slate-100">
              <td className="p-2 font-medium">{o.fornitore.nome}</td>
              <td className="p-2">{o.prezzo ? `€${o.prezzo}` : <span className="text-slate-400 italic">non specificato</span>}</td>
              <td className="p-2">{o.condizioniPagamento || <span className="text-slate-400 italic">non specificato</span>}</td>
              <td className="p-2">{o.tempiConsegna || <span className="text-slate-400 italic">non specificato</span>}</td>
              <td className="p-2">{o.esclusioni || <span className="text-slate-400 italic">non specificato</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
