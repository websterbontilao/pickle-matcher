import { MatchHistoryList } from "@/components/history/MatchHistoryList";

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="border-b px-3 py-2">
        <h1 className="text-sm font-semibold">History</h1>
      </div>
      <MatchHistoryList />
    </div>
  );
}
