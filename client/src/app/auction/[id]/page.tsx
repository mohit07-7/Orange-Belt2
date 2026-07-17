import AuctionRoom from "@/components/AuctionRoom";

/**
 * Auction detail page — renders the interactive AuctionRoom for
 * a specific auction ID extracted from the URL.
 *
 * This is a Server Component that extracts the `id` param and
 * passes it to the client-interactive AuctionRoom.
 */
export default async function AuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let auctionId: bigint;
  try {
    auctionId = BigInt(id);
  } catch {
    return (
      <main className="flex flex-1 items-center justify-center p-12">
        <div className="border-2 border-[#ef4444] bg-[#ef4444]/10 p-6 text-center shadow-[6px_6px_0px_0px_#7f1d1d]">
          <p className="mb-2 font-mono text-lg font-bold text-[#ef4444]">!!</p>
          <p className="text-sm font-bold uppercase tracking-wider text-[#ef4444]">INVALID AUCTION ID</p>
        </div>
      </main>
    );
  }

  return <AuctionRoom auctionId={auctionId} />;
}
