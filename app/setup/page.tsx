import { CourtList } from "@/components/setup/CourtList";
import { FormatToggle } from "@/components/setup/FormatToggle";

export default function SetupPage() {
  return (
    <div className="mx-auto max-w-2xl divide-y">
      <div className="px-3 py-2">
        <h1 className="text-sm font-semibold">Setup</h1>
      </div>
      <FormatToggle />
      <CourtList />
    </div>
  );
}
