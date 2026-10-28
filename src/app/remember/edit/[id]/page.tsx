import EditTribute from "./EditTribute";

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="rm-wrap">
      <EditTribute id={id} />
    </main>
  );
}
