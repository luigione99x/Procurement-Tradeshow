import ChatAssistente from "@/components/ChatAssistente";

// Tab dedicata all'assistente AI di progetto (Q&A libero sullo stato della
// pratica), separata dalla tab "Fornitori" (tool di sourcing/vendita) per non
// sovrapporre visivamente due strumenti diversi.
export default function AssistentePage({ params }: { params: { id: string } }) {
  return <ChatAssistente praticaId={params.id} variant="embedded" />;
}
